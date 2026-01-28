from __future__ import annotations

from apps.api.common.repositories import BaseRepository
from apps.api.models.asset_share import AssetShareLinkRecord


class ShareLinksRepository(BaseRepository):
    async def get_by_token(self, *, token: str) -> AssetShareLinkRecord | None:
        return await AssetShareLinkRecord.get_or_none(token=token)
