from __future__ import annotations

import asyncio
import mimetypes
from uuid import UUID

from starlette.responses import RedirectResponse, Response

from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.http.content_disposition import build_attachment_content_disposition
from src.core.http.file_stream import stream_file_response
from src.core.i18n import t
from src.core.logging import get_logger
from src.modules.assets.repository import AssetsRepository
from src.modules.assets.schema import AssetPublicView
from src.platform.assets.images import (
    IMAGE_TRANSFORM_CACHE_CONTROL,
    ImageTransformParams,
    derive_image_transform_object_key,
    has_image_transform_request,
    transform_image_to_path,
)
from src.platform.storage.factory import build_storage_provider
from src.platform.storage.local import safe_object_key_to_path
from src.platform.storage.profiles import (
    get_effective_storage_profile,
    get_storage_profile_by_key,
    is_local_storage_provider,
)
from src.platform.storage.s3 import S3StorageProvider

logger = get_logger(__name__)
_FATAL_ASSETS_SERVICE_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _ts(key: str, default: str | None = None) -> str:
    return t("errors", key, default=default)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_ASSETS_SERVICE_ERRORS):
        raise exc


def canonical_asset_filename(*, slug: str, ext: str) -> str:
    s = (slug or "asset").strip() or "asset"
    e = (ext or "bin").lstrip(".").strip() or "bin"
    return f"{s}.{e}"


def build_asset_headers(asset: AssetPublicView) -> dict[str, str]:
    headers: dict[str, str] = {
        # Content-addressed (by asset_id) + immutable policy: safe to cache long-term.
        "Cache-Control": "public, max-age=31536000, immutable",
    }
    if asset.checksum_sha256:
        headers["ETag"] = f'"{asset.checksum_sha256}"'
    if not asset.indexable:
        headers["X-Robots-Tag"] = "noindex"
    return headers


def build_asset_redirect_headers(asset: AssetPublicView) -> dict[str, str]:
    headers = build_asset_headers(asset)
    headers["Cache-Control"] = "no-store"
    return headers


class AssetsService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repo = AssetsRepository()

    async def _get_profile_for_key(self, profile_key: str | None):
        if profile_key:
            return await get_storage_profile_by_key(settings=self.settings, profile_key=profile_key)
        _key, profile = await get_effective_storage_profile(self.settings)
        return profile

    def _can_direct_deliver(
        self,
        *,
        profile,
        storage_bucket: str | None,
    ) -> bool:
        mode = str(getattr(profile, "public_delivery_mode", "auto") or "auto").strip().lower()
        if mode == "presign":
            return False
        base = (profile.public_base_url or "").strip()
        if not base:
            return False

        public_bucket = (profile.public_bucket or "").strip() or None
        if public_bucket:
            b = (storage_bucket or "").strip() or None
            return b == public_bucket

        return bool(getattr(profile.capabilities, "supports_custom_public_base_url", False))

    def _public_absolute_url(self, *, base_url: str | None, path: str) -> str | None:
        base = (base_url or "").strip()
        if not base:
            return None
        b = base.rstrip("/")
        p = path if path.startswith("/") else f"/{path}"
        return f"{b}{p}"

    async def _get_public_view(self, *, asset_id: UUID) -> AssetPublicView:
        asset = await self.repo.get_public_asset(asset_id=asset_id)
        if asset is None:
            raise NotFound(error="NOT_FOUND")

        slug = (asset.slug or "asset").strip() or "asset"
        ext = (asset.ext or "bin").lstrip(".").lower() or "bin"
        return AssetPublicView(
            id=asset.id,
            slug=slug,
            ext=ext,
            mime=asset.mime,
            checksum_sha256=asset.checksum_sha256,
            original_filename=asset.original_filename,
            object_key=asset.object_key,
            storage_bucket=str(getattr(asset, "storage_bucket", "") or "") or None,
            storage_profile_key=str(getattr(asset, "storage_profile_key", "") or "") or None,
            indexable=bool(asset.indexable),
            variants=asset.variants if isinstance(asset.variants, dict) else None,
            storage_provider=str(asset.storage_provider),
        )

    async def _try_build_remote_provider(self, *, profile_key: str | None, object_key: str) -> S3StorageProvider | None:
        try:
            profile = await self._get_profile_for_key(profile_key)
            provider = build_storage_provider(profile)
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Build S3 storage provider failed",
                action="build_s3_storage_provider",
                object_key=object_key,
                error=str(exc),
            )
            return None

        if not isinstance(provider, S3StorageProvider):
            logger.warning(
                "Unexpected S3 storage provider type",
                action="build_s3_storage_provider",
                object_key=object_key,
                provider_type=type(provider).__name__,
            )
            return None

        return provider

    async def redirect_to_canonical(self, *, asset_id: UUID) -> RedirectResponse:
        view = await self._get_public_view(asset_id=asset_id)
        name = canonical_asset_filename(slug=view.slug, ext=view.ext)
        return RedirectResponse(url=f"/assets/{encode_uuid(view.id)}/{name}", status_code=301)

    async def serve(
        self,
        *,
        asset_id: UUID,
        filename: str,
        range_header: str | None,
        transform: ImageTransformParams | None = None,
    ) -> Response:
        view = await self._get_public_view(asset_id=asset_id)
        canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
        if filename != canonical:
            return RedirectResponse(url=f"/assets/{encode_uuid(view.id)}/{canonical}", status_code=301)

        if has_image_transform_request(transform):
            return await self._serve_local_image_transform(view=view, transform=transform)

        if not is_local_storage_provider(view.storage_provider):
            profile = await self._get_profile_for_key(getattr(view, "storage_profile_key", None))
            if self._can_direct_deliver(profile=profile, storage_bucket=view.storage_bucket):
                url = self._public_absolute_url(base_url=profile.public_base_url, path=f"/{view.object_key}")
            else:
                url = None
            if url:
                return RedirectResponse(url=url, status_code=302, headers=build_asset_redirect_headers(view))

            # Dev / no-CDN fallback: presigned GET.
            provider = await self._try_build_remote_provider(
                profile_key=getattr(view, "storage_profile_key", None),
                object_key=view.object_key,
            )
            if provider is None:
                raise NotFound(error="NOT_FOUND")
            if view.storage_bucket:
                provider = provider.with_bucket(view.storage_bucket)
            presigned = await provider.presign_get_object(
                object_key=view.object_key,
                expires_in=int(profile.presign_expires_seconds),
                response_content_type=view.mime or "application/octet-stream",
            )
            return RedirectResponse(url=presigned, status_code=302, headers=build_asset_redirect_headers(view))

        root_dir = self.settings.storage.local_root_dir
        path = safe_object_key_to_path(root_dir, view.object_key)
        if not path.is_file():
            raise NotFound(error="NOT_FOUND")

        media_type = view.mime
        if not media_type:
            media_type, _enc = mimetypes.guess_type(f"file.{view.ext}")
        media_type = media_type or "application/octet-stream"

        return await stream_file_response(
            path=path,
            content_type=media_type,
            range_header=range_header,
            extra_headers=build_asset_headers(view),
        )

    async def _serve_local_image_transform(
        self,
        *,
        view: AssetPublicView,
        transform: ImageTransformParams | None,
    ) -> Response:
        if transform is None:
            raise BadRequest(
                message=_ts("ASSET_IMAGE_TRANSFORM_INVALID"),
                error="ASSET_IMAGE_TRANSFORM_INVALID",
            )
        if not str(view.mime or "").lower().startswith("image/"):
            raise BadRequest(
                message=_ts("ASSET_IMAGE_TRANSFORM_UNSUPPORTED"),
                error="ASSET_IMAGE_TRANSFORM_UNSUPPORTED",
            )
        if not is_local_storage_provider(view.storage_provider):
            raise BadRequest(
                message=_ts("ASSET_IMAGE_TRANSFORM_LOCAL_ONLY"),
                error="ASSET_IMAGE_TRANSFORM_UNSUPPORTED",
            )

        root_dir = self.settings.storage.local_root_dir
        source_path = safe_object_key_to_path(root_dir, view.object_key)
        if not source_path.is_file():
            raise NotFound(error="NOT_FOUND")

        source_version = view.checksum_sha256 or str(source_path.stat().st_mtime_ns)
        object_key = derive_image_transform_object_key(
            source_object_key=view.object_key,
            source_version=source_version,
            params=transform,
        )
        output_path = safe_object_key_to_path(root_dir, object_key)
        result = await transform_image_to_path(
            source_path=source_path,
            output_path=output_path,
            output_object_key=object_key,
            params=transform,
            source_ext=view.ext,
        )
        headers = build_asset_headers(view)
        headers["Cache-Control"] = IMAGE_TRANSFORM_CACHE_CONTROL
        headers["ETag"] = f'"{source_version}:{transform.canonical_token()}"'
        headers["X-Image-Transform-Cache"] = "hit" if result.cache_hit else "miss"
        return await stream_file_response(
            path=result.path,
            content_type=result.content_type,
            range_header=None,
            extra_headers=headers,
        )

    async def download(
        self,
        *,
        asset_id: UUID,
        range_header: str | None,
    ) -> Response:
        view = await self._get_public_view(asset_id=asset_id)
        fallback = canonical_asset_filename(slug=view.slug, ext=view.ext)
        filename = (view.original_filename or "").strip() or fallback

        if not is_local_storage_provider(view.storage_provider):
            profile = await self._get_profile_for_key(getattr(view, "storage_profile_key", None))
            provider = await self._try_build_remote_provider(
                profile_key=getattr(view, "storage_profile_key", None),
                object_key=view.object_key,
            )
            if provider is None:
                raise NotFound(error="NOT_FOUND")
            if view.storage_bucket:
                provider = provider.with_bucket(view.storage_bucket)
            url = await provider.presign_get_object(
                object_key=view.object_key,
                expires_in=int(profile.presign_expires_seconds),
                response_content_type=view.mime or "application/octet-stream",
                response_content_disposition=build_attachment_content_disposition(filename),
            )
            return RedirectResponse(url=url, status_code=302, headers=build_asset_redirect_headers(view))

        root_dir = self.settings.storage.local_root_dir
        path = safe_object_key_to_path(root_dir, view.object_key)
        if not path.is_file():
            raise NotFound(error="NOT_FOUND")

        media_type = view.mime or "application/octet-stream"
        headers = build_asset_headers(view)
        headers["Content-Disposition"] = build_attachment_content_disposition(filename)
        return await stream_file_response(
            path=path,
            content_type=media_type,
            range_header=range_header,
            extra_headers=headers,
        )

    async def thumbnail(
        self,
        *,
        asset_id: UUID,
        width: int | None,
        range_header: str | None,
    ) -> Response:
        view = await self._get_public_view(asset_id=asset_id)
        thumbs = []
        if isinstance(view.variants, dict):
            thumbs = view.variants.get("thumbnails") or []

        if not isinstance(thumbs, list) or not thumbs:
            canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
            return RedirectResponse(url=f"/assets/{encode_uuid(view.id)}/{canonical}", status_code=302)

        ordered = sorted(
            [t for t in thumbs if isinstance(t, dict) and isinstance(t.get("width"), int)],
            key=lambda x: int(x.get("width") or 0),
        )
        if not ordered:
            canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
            return RedirectResponse(url=f"/assets/{encode_uuid(view.id)}/{canonical}", status_code=302)

        picked = None
        if width is None:
            picked = ordered[0]
        else:
            for t in ordered:
                if int(t.get("width") or 0) >= int(width):
                    picked = t
                    break
            picked = picked or ordered[-1]

        object_key = str((picked or {}).get("object_key") or "")
        if not object_key:
            canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
            return RedirectResponse(url=f"/assets/{encode_uuid(view.id)}/{canonical}", status_code=302)

        if not is_local_storage_provider(view.storage_provider):
            profile = await self._get_profile_for_key(getattr(view, "storage_profile_key", None))
            if self._can_direct_deliver(profile=profile, storage_bucket=view.storage_bucket):
                url = self._public_absolute_url(base_url=profile.public_base_url, path=f"/{object_key}")
            else:
                url = None
            if url:
                return RedirectResponse(url=url, status_code=302, headers=build_asset_redirect_headers(view))

            provider = await self._try_build_remote_provider(
                profile_key=getattr(view, "storage_profile_key", None),
                object_key=object_key,
            )
            if provider is not None:
                if view.storage_bucket:
                    provider = provider.with_bucket(view.storage_bucket)
                presigned = await provider.presign_get_object(
                    object_key=object_key,
                    expires_in=int(profile.presign_expires_seconds),
                    response_content_type=str((picked or {}).get("mime") or "") or "application/octet-stream",
                )
                return RedirectResponse(url=presigned, status_code=302, headers=build_asset_redirect_headers(view))

            canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
            return RedirectResponse(url=f"/assets/{encode_uuid(view.id)}/{canonical}", status_code=302)

        path = safe_object_key_to_path(self.settings.storage.local_root_dir, object_key)
        if not path.is_file():
            canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
            return RedirectResponse(url=f"/assets/{encode_uuid(view.id)}/{canonical}", status_code=302)

        media_type = str((picked or {}).get("mime") or "") or "application/octet-stream"
        headers = build_asset_headers(view)
        if view.checksum_sha256:
            vname = str((picked or {}).get("name") or "thumb")
            headers["ETag"] = f'"{view.checksum_sha256}:{vname}"'

        return await stream_file_response(
            path=path,
            content_type=media_type,
            range_header=range_header,
            extra_headers=headers,
        )
