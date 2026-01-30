from __future__ import annotations

from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound
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

    async def list_usages_by_asset(self, *, org_id: UUID, asset_id: UUID) -> list[AdminAssetUsageOut]:
        asset = await AssetRecord.get_or_none(id=asset_id, org_id=org_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        rows = await self.repo.list_usages_by_asset(org_id=org_id, asset_id=asset_id)
        return [
            AdminAssetUsageOut(
                id=r.id,
                asset_id=r.asset_id,
                purpose=r.purpose,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                field_key=r.field_key,
                created_by_user_id=r.created_by_user_id,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ]

    async def upsert_usage(
        self,
        *,
        org_id: UUID,
        actor_user_id: UUID | None,
        payload: AdminAssetUsageUpsertRequest,
    ) -> AdminAssetUsageOut:
        # 保护：asset 必须属于当前 org，避免跨租户引用。
        asset = await AssetRecord.get_or_none(id=payload.asset_id, org_id=org_id)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")

        entity_type = payload.entity_type.strip()
        entity_id = payload.entity_id.strip()
        field_key = payload.field_key.strip()
        purpose = payload.purpose.strip()

        if not entity_type or not entity_id or not field_key or not purpose:
            raise BadRequest(message=_ts("USAGE_INVALID", "引用信息不完整"), error="USAGE_INVALID")

        row = await self.repo.upsert_usage(
            org_id=org_id,
            asset_id=payload.asset_id,
            purpose=purpose,
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
            created_by_user_id=actor_user_id,
        )
        return AdminAssetUsageOut(
            id=row.id,
            asset_id=row.asset_id,
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
        org_id: UUID,
        payload: AdminAssetUsageDeleteRequest,
    ) -> AdminAssetUsageDeleteOut:
        entity_type = payload.entity_type.strip()
        entity_id = payload.entity_id.strip()
        field_key = payload.field_key.strip()
        if not entity_type or not entity_id or not field_key:
            raise BadRequest(message=_ts("USAGE_INVALID", "引用信息不完整"), error="USAGE_INVALID")

        deleted = await self.repo.delete_usage_by_ref(
            org_id=org_id,
            entity_type=entity_type,
            entity_id=entity_id,
            field_key=field_key,
        )
        return AdminAssetUsageDeleteOut(deleted=deleted)
