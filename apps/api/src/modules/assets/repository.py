from __future__ import annotations

from uuid import UUID

from apps.api.src.common.repositories import BaseRepository
from apps.api.src.models.assets.asset import AssetRecord, AssetVisibility


class AssetsRepository(BaseRepository):
    async def get_public_asset(self, *, asset_id: UUID) -> AssetRecord | None:
        """
        Fetch a public, non-deleted asset.

        We intentionally treat non-public assets as "not found" to avoid leaking existence.
        """

        return await AssetRecord.get_or_none(id=asset_id, deleted_at=None, visibility=AssetVisibility.PUBLIC)
