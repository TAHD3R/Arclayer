from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.assets.asset import AssetRecord, AssetVisibility


class CampaignAssetReader(Protocol):
    async def get_publishable_assets(self, asset_ids: Sequence[UUID]) -> dict[UUID, AssetRecord]: ...


class NotificationCampaignAssetRepository(TortoiseORMRepository[AssetRecord]):
    async def get_publishable_assets(self, asset_ids: Sequence[UUID]) -> dict[UUID, AssetRecord]:
        if not asset_ids:
            return {}
        rows = await AssetRecord.filter(
            id__in=list(asset_ids),
            deleted_at=None,
            visibility=AssetVisibility.PUBLIC,
        )
        return {UUID(str(row.id)): row for row in rows}
