from __future__ import annotations

from fastapi import APIRouter, Depends

from apps.api.config import Settings, get_settings
from apps.api.core.http.response import Response, ResponseModel
from apps.api.core.workspace.authz import require_workspace_permission
from apps.api.core.workspace.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.routers.v1.admin.assets.router import router as workspace_assets_router
from apps.api.routers.v1.admin.menus.router import router as workspace_menus_router
from apps.api.routers.v1.admin.notifications.router import router as workspace_notifications_router
from apps.api.routers.v1.admin.shares.router import router as workspace_shares_router
from apps.api.routers.v1.admin.uploads.router import router as workspace_uploads_router
from apps.api.routers.v1.admin.usages.router import router as workspace_usages_router
from apps.api.routers.v1.auth.deps import get_current_user_id
from apps.api.routers.v1.workspaces.authz.router import router as workspace_authz_router
from apps.api.routers.v1.workspaces.rbac.router import router as workspace_rbac_router
from apps.api.routers.v1.workspaces.schema import MyWorkspaceListResult, WorkspaceDetailOut, WorkspaceUpdateRequest
from apps.api.routers.v1.workspaces.service import WorkspaceService
from apps.api.routers.v1.workspaces.settings import router as workspace_settings_router
from apps.api.routers.v1.workspaces.team import router as workspace_team_router
from apps.api.routers.v1.workspaces.themes.router import router as workspace_themes_router

router = APIRouter(tags=["Workspaces"])
router.include_router(workspace_team_router)
router.include_router(workspace_settings_router)
router.include_router(workspace_authz_router)
router.include_router(workspace_rbac_router)
router.include_router(workspace_assets_router)
router.include_router(workspace_uploads_router)
router.include_router(workspace_shares_router)
router.include_router(workspace_usages_router)
router.include_router(workspace_notifications_router)
router.include_router(workspace_menus_router)
router.include_router(workspace_themes_router)


@router.get(
    "/me/workspaces",
    response_model=ResponseModel[MyWorkspaceListResult],
    summary="List workspaces visible to current user",
)
async def list_my_workspaces(
    user_id=Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[MyWorkspaceListResult]:
    service = WorkspaceService(settings)
    items = await service.list_my_workspaces(user_id=user_id)
    return Response.success(data=MyWorkspaceListResult(items=items))


@router.get(
    "/workspaces/{workspace_id}",
    response_model=ResponseModel[WorkspaceDetailOut],
    summary="Get workspace metadata (name/slug)",
    dependencies=[require_workspace_permission("system:settings:read")],
)
async def get_workspace_detail(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceDetailOut]:
    service = WorkspaceService(settings)
    detail = await service.get_workspace_detail(organization_id=ctx.organization_id, workspace_id=ctx.workspace_id)
    return Response.success(data=detail)


@router.patch(
    "/workspaces/{workspace_id}",
    response_model=ResponseModel[WorkspaceDetailOut],
    summary="Update workspace metadata (name/slug)",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def update_workspace(
    payload: WorkspaceUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceDetailOut]:
    service = WorkspaceService(settings)
    detail = await service.update_workspace(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        payload=payload,
    )
    return Response.success(data=detail)
