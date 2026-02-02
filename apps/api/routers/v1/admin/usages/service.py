from __future__ import annotations

from typing import cast
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.common.utils.tortoise_protocols import AssetUsageHasAssetId
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.core.i18n import t
from apps.api.models.asset import AssetRecord
from apps.api.routers.v1.admin.usages.repository import AdminAssetUsagesRepository
from apps.api.routers.v1.admin.usages.schema import (
    AdminAssetUsageDeleteOut,
    AdminAssetUsageDeleteRequest,
    AdminAssetUsageOut,
    AdminAssetUsageUpsertRequest,
)


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


class AdminAssetUsagesService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = AdminAssetUsagesRepository()

    async def list_usages_by_asset(
        self, *, workspace_id: UUID, asset_id: UUID, params: PageParams
    ) -> PageData[AdminAssetUsageOut]:
        asset = await AssetRecord.get_or_none(id=asset_id, workspace_id=workspace_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        qs = self.repo.query_usages_by_asset(workspace_id=workspace_id, asset_id=asset_id)
        return await paginate_queryset(qs, params=params, out_schema=AdminAssetUsageOut)

    async def upsert_usage(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID | None,
        payload: AdminAssetUsageUpsertRequest,
    ) -> AdminAssetUsageOut:
        # Guard: the asset must belong to the current org to prevent cross-tenant references.
        asset = await AssetRecord.get_or_none(id=payload.asset_id, workspace_id=workspace_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        entity_type = payload.entity_type.strip()
        entity_id = payload.entity_id.strip()
        field_key = payload.field_key.strip()
        purpose = payload.purpose.strip()

        if not entity_type or not entity_id or not field_key or not purpose:
            raise BadRequest(message=_ts("USAGE_INVALID", "引用信息不完整"), error="USAGE_INVALID")

        row = await self.repo.upsert_usage(
            workspace_id=workspace_id,
            asset_id=payload.asset_id,
            purpose=purpose,
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
            created_by_user_id=actor_user_id,
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
        workspace_id: UUID,
        payload: AdminAssetUsageDeleteRequest,
    ) -> AdminAssetUsageDeleteOut:
        entity_type = payload.entity_type.strip()
        entity_id = payload.entity_id.strip()
        field_key = payload.field_key.strip()
        if not entity_type or not entity_id or not field_key:
            raise BadRequest(message=_ts("USAGE_INVALID", "引用信息不完整"), error="USAGE_INVALID")

        deleted = await self.repo.delete_usage_by_ref(
            workspace_id=workspace_id,
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
        )
        return AdminAssetUsageDeleteOut(deleted=deleted)
