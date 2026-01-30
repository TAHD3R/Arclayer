from __future__ import annotations

from datetime import datetime
from uuid import UUID

from apps.api.common.repositories import BaseRepository
from apps.api.common.schemas import BaseSchema
from apps.api.models.asset_share import AssetShareLinkRecord


class ShareLinkRow(BaseSchema):
    org_id: UUID
    asset_id: UUID
    token: str
    expires_at: datetime | None
    revoked_at: datetime | None


class ShareLinksRepository(BaseRepository):
    async def get_by_token(self, *, token: str) -> ShareLinkRow | None:
        rows = await AssetShareLinkRecord.filter(token=token).values(
            "org_id",
            "asset_id",
            "token",
            "expires_at",
            "revoked_at",
        )
        if not rows:
            return None
        return ShareLinkRow.model_validate(rows[0])
