from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from uuid import UUID

from starlette.responses import RedirectResponse, Response

from apps.api.config import Settings
from apps.api.core.exceptions import NotFound
from apps.api.http.content_disposition import build_attachment_content_disposition
from apps.api.http.file_stream import stream_file_response
from apps.api.infra.storage.factory import build_storage_provider_for
from apps.api.infra.storage.local import safe_object_key_to_path
from apps.api.infra.storage.s3 import S3StorageProvider
from apps.api.routers.assets.repository import AssetsRepository
from apps.api.settings.runtime import get_effective_settings


@dataclass(frozen=True, slots=True)
class AssetPublicView:
    id: UUID
    slug: str
    ext: str
    mime: str | None
    checksum_sha256: str | None
    original_filename: str | None
    object_key: str
    indexable: bool
    variants: dict | None
    storage_provider: str


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


class AssetsService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repo = AssetsRepository()

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
            raise NotFound(message="Not Found", error="NOT_FOUND")

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
            indexable=bool(asset.indexable),
            variants=asset.variants if isinstance(asset.variants, dict) else None,
            storage_provider=str(asset.storage_provider),
        )

    async def redirect_to_canonical(self, *, asset_id: UUID) -> RedirectResponse:
        view = await self._get_public_view(asset_id=asset_id)
        name = canonical_asset_filename(slug=view.slug, ext=view.ext)
        return RedirectResponse(url=f"/assets/{view.id}/{name}", status_code=301)

    async def serve(
        self,
        *,
        asset_id: UUID,
        filename: str,
        range_header: str | None,
    ) -> Response:
        view = await self._get_public_view(asset_id=asset_id)
        canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
        if filename != canonical:
            return RedirectResponse(url=f"/assets/{view.id}/{canonical}", status_code=301)

        if view.storage_provider == "s3":
            effective = await get_effective_settings(self.settings)
            url = self._public_absolute_url(base_url=effective.storage.public_base_url, path=f"/{view.object_key}")
            if url:
                return RedirectResponse(url=url, status_code=302, headers=build_asset_headers(view))

            # Dev / no-CDN fallback: presigned GET.
            try:
                provider = build_storage_provider_for(effective, provider="s3")
            except Exception:
                raise NotFound(message="Not Found", error="NOT_FOUND")
            if not isinstance(provider, S3StorageProvider):
                raise NotFound(message="Not Found", error="NOT_FOUND")
            presigned = await provider.presign_get_object(
                object_key=view.object_key,
                expires_in=900,
                response_content_type=view.mime or "application/octet-stream",
            )
            return RedirectResponse(url=presigned, status_code=302, headers=build_asset_headers(view))

        root_dir = self.settings.storage.local_root_dir
        path = safe_object_key_to_path(root_dir, view.object_key)
        if not path.is_file():
            raise NotFound(message="Not Found", error="NOT_FOUND")

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

    async def download(
        self,
        *,
        asset_id: UUID,
        range_header: str | None,
    ) -> Response:
        view = await self._get_public_view(asset_id=asset_id)
        fallback = canonical_asset_filename(slug=view.slug, ext=view.ext)
        filename = (view.original_filename or "").strip() or fallback

        if view.storage_provider == "s3":
            effective = await get_effective_settings(self.settings)
            try:
                provider = build_storage_provider_for(effective, provider="s3")
            except Exception:
                raise NotFound(message="Not Found", error="NOT_FOUND")
            if not isinstance(provider, S3StorageProvider):
                raise NotFound(message="Not Found", error="NOT_FOUND")
            url = await provider.presign_get_object(
                object_key=view.object_key,
                expires_in=900,
                response_content_type=view.mime or "application/octet-stream",
                response_content_disposition=build_attachment_content_disposition(filename),
            )
            return RedirectResponse(url=url, status_code=302, headers=build_asset_headers(view))

        root_dir = self.settings.storage.local_root_dir
        path = safe_object_key_to_path(root_dir, view.object_key)
        if not path.is_file():
            raise NotFound(message="Not Found", error="NOT_FOUND")

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
            return RedirectResponse(url=f"/assets/{view.id}/{canonical}", status_code=302)

        ordered = sorted(
            [t for t in thumbs if isinstance(t, dict) and isinstance(t.get("width"), int)],
            key=lambda x: int(x.get("width") or 0),
        )
        if not ordered:
            canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
            return RedirectResponse(url=f"/assets/{view.id}/{canonical}", status_code=302)

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
            return RedirectResponse(url=f"/assets/{view.id}/{canonical}", status_code=302)

        if view.storage_provider == "s3":
            effective = await get_effective_settings(self.settings)
            url = self._public_absolute_url(base_url=effective.storage.public_base_url, path=f"/{object_key}")
            if url:
                return RedirectResponse(url=url, status_code=302, headers=build_asset_headers(view))

            try:
                provider = build_storage_provider_for(effective, provider="s3")
            except Exception:
                provider = None
            if isinstance(provider, S3StorageProvider):
                presigned = await provider.presign_get_object(
                    object_key=object_key,
                    expires_in=900,
                    response_content_type=str((picked or {}).get("mime") or "") or "application/octet-stream",
                )
                return RedirectResponse(url=presigned, status_code=302, headers=build_asset_headers(view))

            canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
            return RedirectResponse(url=f"/assets/{view.id}/{canonical}", status_code=302)

        path = safe_object_key_to_path(self.settings.storage.local_root_dir, object_key)
        if not path.is_file():
            canonical = canonical_asset_filename(slug=view.slug, ext=view.ext)
            return RedirectResponse(url=f"/assets/{view.id}/{canonical}", status_code=302)

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
