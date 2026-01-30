from __future__ import annotations

from datetime import datetime
from uuid import UUID

from apps.api.common.repositories import BaseRepository
from apps.api.models.asset_share import AssetShareLinkRecord


class AdminSharesRepository(BaseRepository):
    async def create_share_link(
        self,
        *,
        org_id: UUID,
        asset_id: UUID,
        token: str,
        expires_at: datetime | None,
        created_by_user_id: UUID | None,
    ) -> AssetShareLinkRecord:
        return await AssetShareLinkRecord.create(
            org_id=org_id,
            asset_id=asset_id,
            token=token,
            expires_at=expires_at,
            revoked_at=None,
            created_by_user_id=created_by_user_id,
        )

    async def get_link(self, *, org_id: UUID, link_id: UUID) -> AssetShareLinkRecord | None:
        return await AssetShareLinkRecord.get_or_none(id=link_id, org_id=org_id)

    async def list_links(self, *, org_id: UUID, asset_id: UUID) -> list[AssetShareLinkRecord]:
        return await AssetShareLinkRecord.filter(org_id=org_id, asset_id=asset_id).order_by("-created_at").all()

    async def revoke(self, link: AssetShareLinkRecord, *, revoked_at: datetime) -> AssetShareLinkRecord:
        if link.revoked_at is None:
            link.revoked_at = revoked_at
            await link.save(update_fields=["revoked_at", "updated_at"])
        return link
