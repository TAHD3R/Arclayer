from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from starlette.responses import Response

from apps.api.config import Settings
from apps.api.core.exceptions import NotFound
from apps.api.http.content_disposition import build_attachment_content_disposition
from apps.api.http.file_stream import stream_file_response
from apps.api.infra.storage.local import safe_object_key_to_path
from apps.api.models.asset import AssetRecord
from apps.api.models.asset_share import AssetShareLinkRecord
from apps.api.routers.shares.repository import ShareLinksRepository


@dataclass(frozen=True, slots=True)
class ShareResolved:
    org_id: UUID
    asset_id: UUID
    token: str
    expires_at: datetime | None
    revoked_at: datetime | None


def is_share_link_active(link: AssetShareLinkRecord, *, now: datetime | None = None) -> bool:
    """
    Share links are active if:
    - not revoked
    - not expired
    """

    if link.revoked_at is not None:
        return False
    now = now or datetime.now(tz=UTC)
    if link.expires_at is not None and link.expires_at <= now:
        return False
    return True


class SharesService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repo = ShareLinksRepository()

    async def resolve(self, *, token: str) -> ShareResolved:
        link = await self.repo.get_by_token(token=token)
        if link is None or not is_share_link_active(link):
            # Do not leak existence: treat revoked/expired as not found.
            raise NotFound(message="Not Found", error="NOT_FOUND")

        return ShareResolved(
            org_id=link.org_id,
            asset_id=link.asset_id,
            token=link.token,
            expires_at=link.expires_at,
            revoked_at=link.revoked_at,
        )

    async def _get_asset(self, *, org_id: UUID, asset_id: UUID) -> AssetRecord:
        asset = await AssetRecord.get_or_none(id=asset_id, org_id=org_id, deleted_at=None)
        if asset is None:
            raise NotFound(message="Not Found", error="NOT_FOUND")
        return asset

    async def preview(self, *, token: str, range_header: str | None) -> Response:
        resolved = await self.resolve(token=token)
        asset = await self._get_asset(org_id=resolved.org_id, asset_id=resolved.asset_id)

        root_dir = self.settings.storage.local_root_dir
        path = safe_object_key_to_path(root_dir, asset.object_key)
        if not path.is_file():
            raise NotFound(message="Not Found", error="NOT_FOUND")

        media_type = asset.mime
        if not media_type:
            media_type, _enc = mimetypes.guess_type(f"file.{asset.ext or 'bin'}")
        media_type = media_type or "application/octet-stream"

        # Share links are link-only and should not be indexed/cached broadly.
        headers: dict[str, str] = {
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex",
        }
        if asset.checksum_sha256:
            headers["ETag"] = f'"{asset.checksum_sha256}"'

        return await stream_file_response(
            path=path,
            content_type=media_type,
            range_header=range_header,
            extra_headers=headers,
        )

    async def download(self, *, token: str, range_header: str | None) -> Response:
        resolved = await self.resolve(token=token)
        asset = await self._get_asset(org_id=resolved.org_id, asset_id=resolved.asset_id)

        root_dir = self.settings.storage.local_root_dir
        path = safe_object_key_to_path(root_dir, asset.object_key)
        if not path.is_file():
            raise NotFound(message="Not Found", error="NOT_FOUND")

        media_type = asset.mime or "application/octet-stream"
        filename = (asset.original_filename or "").strip() or f"{asset.slug or 'asset'}.{asset.ext or 'bin'}"

        headers: dict[str, str] = {
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex",
            "Content-Disposition": build_attachment_content_disposition(filename),
        }
        if asset.checksum_sha256:
            headers["ETag"] = f'"{asset.checksum_sha256}"'

        return await stream_file_response(
            path=path,
            content_type=media_type,
            range_header=range_header,
            extra_headers=headers,
        )
