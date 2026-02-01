from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.core.http.response import Response as JsonResponse
from apps.api.core.http.response import ResponseModel
from apps.api.core.workspace.authz import require_workspace_permission
from apps.api.core.workspace.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.routers.v1.admin.usages.schema import (
    AdminAssetUsageDeleteOut,
    AdminAssetUsageDeleteRequest,
    AdminAssetUsageOut,
    AdminAssetUsageUpsertRequest,
)
from apps.api.routers.v1.admin.usages.service import AdminAssetUsagesService
from apps.api.routers.v1.auth.deps import get_current_user

router = APIRouter(
    prefix="/workspaces/{workspace_id}",
    tags=["Workspace: Asset Usages"],
    dependencies=[require_workspace_permission("admin:access")],
)


def get_admin_asset_usages_service(settings: Settings = Depends(get_settings)) -> AdminAssetUsagesService:
    return AdminAssetUsagesService(settings)


@router.get("/assets/{asset_id}/usages", response_model=ResponseModel[PageData[AdminAssetUsageOut]])
async def list_asset_usages(
    asset_id: UUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[PageData[AdminAssetUsageOut]]:
    page = await service.list_usages_by_asset(workspace_id=ctx.workspace_id, asset_id=asset_id, params=params)
    return JsonResponse.success(data=page)


@router.put("/asset-usages", response_model=ResponseModel[AdminAssetUsageOut])
async def upsert_asset_usage(
    payload: AdminAssetUsageUpsertRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageOut]:
    created = await service.upsert_usage(workspace_id=ctx.workspace_id, actor_user_id=user.id, payload=payload)
    return JsonResponse.success(data=created)


@router.post("/asset-usages/delete", response_model=ResponseModel[AdminAssetUsageDeleteOut])
async def delete_asset_usage_by_ref(
    payload: AdminAssetUsageDeleteRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageDeleteOut]:
    out = await service.delete_usage_by_ref(workspace_id=ctx.workspace_id, payload=payload)
    return JsonResponse.success(data=out)


# Compatibility: some clients do not support DELETE bodies; keep a semantic-equivalent DELETE endpoint.
@router.delete("/asset-usages", response_model=ResponseModel[AdminAssetUsageDeleteOut])
async def delete_asset_usage_by_ref_delete(
    payload: AdminAssetUsageDeleteRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageDeleteOut]:
    out = await service.delete_usage_by_ref(workspace_id=ctx.workspace_id, payload=payload)
    return JsonResponse.success(data=out)
