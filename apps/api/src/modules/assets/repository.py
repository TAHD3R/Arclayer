from __future__ import annotations

from uuid import UUID

from tortoise.transactions import in_transaction

from src.common.repositories import BaseRepository
from src.models.assets.asset import AssetRecord, AssetVisibility
from src.models.tenancy.workspace_tenant import WorkspaceTenantRecord, WorkspaceTenantStatus
from src.modules.tenancy.database import set_tenant_search_path


class AssetsRepository(BaseRepository):
    async def get_public_asset(self, *, asset_id: UUID) -> AssetRecord | None:
        """
        Fetch a public, non-deleted asset.

        We intentionally treat non-public assets as "not found" to avoid leaking existence.
        """

        asset = await AssetRecord.get_or_none(id=asset_id, deleted_at=None, visibility=AssetVisibility.PUBLIC)
        if asset is not None:
            return asset

        ready_schema_names = await WorkspaceTenantRecord.filter(
            status=WorkspaceTenantStatus.READY,
        ).values_list("schema_name", flat=True)
        for schema_name in ready_schema_names:
            async with in_transaction() as conn:
                await set_tenant_search_path(conn, str(schema_name))
                asset = await AssetRecord.get_or_none(
                    id=asset_id,
                    deleted_at=None,
                    visibility=AssetVisibility.PUBLIC,
                    using_db=conn,
                )
                if asset is not None:
                    return asset

        return None
