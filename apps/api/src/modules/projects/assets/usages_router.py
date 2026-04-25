from __future__ import annotations

from fastapi import APIRouter, Depends

from src.common.constants.assets import ASSET_SCOPE_PROJECT
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse as JsonResponse
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
from src.modules.projects.http.router_helpers import require_project_permission
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.tenancy.router_helpers import resolve_project_tenant_context

router = APIRouter(prefix="/projects/{project_id}", tags=["domain.projects.assets.usages"])


def get_admin_asset_usages_service(
    settings: Settings = Depends(get_settings),
    ctx: ProjectRequestContext = Depends(get_project_context),
) -> AdminAssetUsagesService:
    return AdminAssetUsagesService(
        settings,
        resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id),
    )


def _project_scope(ctx: ProjectRequestContext) -> AssetScope:
    return AssetScope(type=ASSET_SCOPE_PROJECT, id=ctx.project_id)


@router.get(
    "/assets/{asset_id}/usages",
    response_model=ResponseModel[PageData[AdminAssetUsageOut]],
    summary="List project asset usages",
    dependencies=[require_project_permission("project:assets:read")],
)
async def list_asset_usages(
    asset_id: PublicUUID,
    ctx: ProjectRequestContext = Depends(get_project_context),
    _user=Depends(get_current_user),
    params: PageParams = Depends(get_page_params),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[PageData[AdminAssetUsageOut]]:
    page = await service.list_usages_by_asset(scope=_project_scope(ctx), asset_id=asset_id, params=params)
    return JsonResponse.success(data=page)


@router.put(
    "/asset-usages",
    response_model=ResponseModel[AdminAssetUsageOut],
    summary="Upsert project asset usage",
    dependencies=[require_project_permission("project:assets:manage")],
)
async def upsert_asset_usage(
    payload: AdminAssetUsageUpsertRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageOut]:
    created = await service.upsert_usage(scope=_project_scope(ctx), actor_user_id=user.id, payload=payload)
    return JsonResponse.success(data=created)


@router.post(
    "/asset-usages/delete",
    response_model=ResponseModel[AdminAssetUsageDeleteOut],
    summary="Delete project asset usage by ref",
    dependencies=[require_project_permission("project:assets:manage")],
)
async def delete_asset_usage_by_ref(
    payload: AdminAssetUsageDeleteRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    _user=Depends(get_current_user),
    service: AdminAssetUsagesService = Depends(get_admin_asset_usages_service),
) -> ResponseModel[AdminAssetUsageDeleteOut]:
    out = await service.delete_usage_by_ref(scope=_project_scope(ctx), payload=payload)
    return JsonResponse.success(data=out)
