from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.organization.deps import get_current_org_id
from apps.api.http_utils.response import Response as JsonResponse
from apps.api.http_utils.response import ResponseModel
from apps.api.routers.v1.admin.usages.schema import (
    AdminAssetUsageDeleteOut,
    AdminAssetUsageDeleteRequest,
    AdminAssetUsageOut,
    AdminAssetUsageUpsertRequest,
)
from apps.api.routers.v1.admin.usages.service import AdminAssetUsagesService
from apps.api.routers.v1.auth.deps import get_current_user

router = APIRouter(tags=["Services: Asset Usages"])


def get_admin_asset_usages_service(settings: Settings = Depends(get_settings)) -> AdminAssetUsagesService:
    return AdminAssetUsagesService(settings)


@router.get("/assets/{asset_id}/usages", response_model=ResponseModel[list[AdminAssetUsageOut]])
async def list_asset_usages(
    asset_id: UUID,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[list[AdminAssetUsageOut]]:
    items = await service.list_usages_by_asset(org_id=org_id, asset_id=asset_id)
    return JsonResponse.success(data=items)


@router.put("/asset-usages", response_model=ResponseModel[AdminAssetUsageOut])
async def upsert_asset_usage(
    payload: AdminAssetUsageUpsertRequest,
    org_id: UUID = Depends(get_current_org_id),
    user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageOut]:
    created = await service.upsert_usage(org_id=org_id, actor_user_id=user.id, payload=payload)
    return JsonResponse.success(data=created)


@router.post("/asset-usages/delete", response_model=ResponseModel[AdminAssetUsageDeleteOut])
async def delete_asset_usage_by_ref(
    payload: AdminAssetUsageDeleteRequest,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageDeleteOut]:
    out = await service.delete_usage_by_ref(org_id=org_id, payload=payload)
    return JsonResponse.success(data=out)


# 兼容：部分客户端/封装不支持 DELETE body，这里保留语义一致的 DELETE 版本（内部转发）。
@router.delete("/asset-usages", response_model=ResponseModel[AdminAssetUsageDeleteOut])
async def delete_asset_usage_by_ref_delete(
    payload: AdminAssetUsageDeleteRequest,
    org_id: UUID = Depends(get_current_org_id),
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageDeleteOut]:
    out = await service.delete_usage_by_ref(org_id=org_id, payload=payload)
    return JsonResponse.success(data=out)
