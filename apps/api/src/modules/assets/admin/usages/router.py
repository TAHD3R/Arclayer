from __future__ import annotations

from fastapi import APIRouter, Depends

from src.common.constants.assets import ASSET_SCOPE_WORKSPACE
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import Response as JsonResponse
from src.core.http.response import ResponseModel
from src.modules.assets.admin.usages.schema import (
    AdminAssetUsageDeleteOut,
    AdminAssetUsageDeleteRequest,
    AdminAssetUsageOut,
    AdminAssetUsageUpsertRequest,
)
from src.modules.assets.admin.usages.service import AdminAssetUsagesService
from src.modules.assets.scope import AssetScope
from src.modules.auth.http.service import get_current_user
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}",
    tags=["Workspace: Asset Usages"],
    dependencies=[require_workspace_permission("system:assets:read")],
)


def get_admin_asset_usages_service(settings: Settings = Depends(get_settings)) -> AdminAssetUsagesService:
    return AdminAssetUsagesService(settings)


def _workspace_scope(ctx: WorkspaceContext) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_WORKSPACE, id=ctx.workspace_id)


@router.get(
    "/assets/{asset_id}/usages",
    response_model=ResponseModel[PageData[AdminAssetUsageOut]],
    summary="List asset usages",
)
async def list_asset_usages(
    asset_id: PublicUUID,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[PageData[AdminAssetUsageOut]]:
    page = await service.list_usages_by_asset(scope=_workspace_scope(ctx), asset_id=asset_id, params=params)
    return JsonResponse.success(data=page)


@router.put(
    "/asset-usages",
    response_model=ResponseModel[AdminAssetUsageOut],
    summary="Upsert asset usage",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def upsert_asset_usage(
    payload: AdminAssetUsageUpsertRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageOut]:
    created = await service.upsert_usage(scope=_workspace_scope(ctx), actor_user_id=user.id, payload=payload)
    return JsonResponse.success(data=created)


@router.post(
    "/asset-usages/delete",
    response_model=ResponseModel[AdminAssetUsageDeleteOut],
    summary="Delete asset usage by ref",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def delete_asset_usage_by_ref(
    payload: AdminAssetUsageDeleteRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageDeleteOut]:
    out = await service.delete_usage_by_ref(scope=_workspace_scope(ctx), payload=payload)
    return JsonResponse.success(data=out)


# Compatibility: some clients do not support DELETE bodies; keep a semantic-equivalent DELETE endpoint.
@router.delete(
    "/asset-usages",
    response_model=ResponseModel[AdminAssetUsageDeleteOut],
    summary="Delete asset usage by ref (compat)",
    dependencies=[require_workspace_permission("system:assets:manage")],
)
async def delete_asset_usage_by_ref_delete(
    payload: AdminAssetUsageDeleteRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageDeleteOut]:
    out = await service.delete_usage_by_ref(scope=_workspace_scope(ctx), payload=payload)
    return JsonResponse.success(data=out)
