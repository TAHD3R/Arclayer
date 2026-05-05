from __future__ import annotations

from typing import cast
from uuid import UUID

from src.common.protocols.tortoise import AssetUsageHasAssetId
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.http.pagination import PageData, PageParams, paginate_queryset
from src.core.i18n import t
from src.core.services import BaseService
from src.modules.assets.admin.assets.repository import AdminAssetsRepository
from src.modules.assets.admin.usages.repository import AdminAssetUsagesRepository
from src.modules.assets.admin.usages.schema import (
    AdminAssetUsageDeleteOut,
    AdminAssetUsageDeleteRequest,
    AdminAssetUsageOut,
    AdminAssetUsageUpsertRequest,
)
from src.modules.assets.scope import AssetScope
from src.modules.tenancy.schema import TenantContext


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


class AdminAssetUsagesService(BaseService):
    def __init__(self, settings: Settings, tenant_context: TenantContext | None = None) -> None:
        super().__init__(settings)
        self.repo = AdminAssetUsagesRepository(tenant_context)
        self.assets_repo = AdminAssetsRepository(tenant_context)

    async def list_usages_by_asset(
        self, *, scope: AssetScope, asset_id: UUID, params: PageParams
    ) -> PageData[AdminAssetUsageOut]:
        async with self.repo.connection(scope=scope) as conn:
            asset = await self.assets_repo.get_asset(scope=scope, asset_id=asset_id, conn=conn)
            if asset is None:
                raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

            qs = self.repo.query_usages_by_asset(scope=scope, asset_id=asset_id, conn=conn)
            return await paginate_queryset(qs, params=params, out_schema=AdminAssetUsageOut)

    async def upsert_usage(
        self,
        *,
        scope: AssetScope,
        actor_user_id: UUID | None,
        payload: AdminAssetUsageUpsertRequest,
    ) -> AdminAssetUsageOut:
        # Guard: the asset must belong to the current org to prevent cross-tenant references.
        async with self.repo.connection(scope=scope) as conn:
            asset = await self.assets_repo.get_asset(scope=scope, asset_id=payload.asset_id, conn=conn)
            if asset is None:
                raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

            entity_type = payload.entity_type.strip()
            entity_id = payload.entity_id.strip()
            field_key = payload.field_key.strip()
            purpose = payload.purpose.strip()

            if not entity_type or not entity_id or not field_key or not purpose:
                raise BadRequest(message=_ts("USAGE_INVALID", "引用信息不完整"), error="USAGE_INVALID")

            row = await self.repo.upsert_usage(
                scope=scope,
                asset_id=payload.asset_id,
                purpose=purpose,
                entity_type=entity_type,
                entity_id=entity_id,
                field_key=field_key,
                created_by_user_id=actor_user_id,
                conn=conn,
            )
        row_like = cast(AssetUsageHasAssetId, row)
        row_asset_id = UUID(str(row_like.asset_id))
        return AdminAssetUsageOut(
            id=row.id,
            asset_id=row_asset_id,
            purpose=row.purpose,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            field_key=row.field_key,
            created_by_user_id=row.created_by_user_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    async def delete_usage_by_ref(
        self,
        *,
        scope: AssetScope,
        payload: AdminAssetUsageDeleteRequest,
    ) -> AdminAssetUsageDeleteOut:
        entity_type = payload.entity_type.strip()
        entity_id = payload.entity_id.strip()
        field_key = payload.field_key.strip()
        if not entity_type or not entity_id or not field_key:
            raise BadRequest(message=_ts("USAGE_INVALID", "引用信息不完整"), error="USAGE_INVALID")

        async with self.repo.connection(scope=scope) as conn:
            deleted = await self.repo.delete_usage_by_ref(
                scope=scope,
                entity_type=entity_type,
                entity_id=entity_id,
                field_key=field_key,
                conn=conn,
            )
        return AdminAssetUsageDeleteOut(deleted=deleted)
