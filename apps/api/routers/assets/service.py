from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from uuid import UUID

from starlette.responses import RedirectResponse, Response

from apps.api.config import Settings
from apps.api.core.exceptions import NotFound
from apps.api.http.content_disposition import build_attachment_content_disposition
from apps.api.http.file_stream import stream_file_response
from apps.api.infra.storage.local import safe_object_key_to_path
from apps.api.routers.assets.repository import AssetsRepository


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
