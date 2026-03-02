from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from apps.api.config import Settings, get_settings
from apps.api.core.http.response import Response, ResponseModel
from apps.api.modules.analytics.workspaces.router import router as workspace_activity_router
from apps.api.modules.assets.admin.assets.router import router as workspace_assets_router
from apps.api.modules.assets.admin.uploads.router import router as workspace_uploads_router
from apps.api.modules.assets.admin.usages.router import router as workspace_usages_router
from apps.api.modules.auth.deps import get_current_user_id
from apps.api.modules.organization.deps import get_current_org_membership
from apps.api.modules.organization.models.org_membership import OrgMembership
from apps.api.modules.organization.workspaces.service import OrganizationWorkspaceService
from apps.api.modules.system.admin.extensions.router import router as workspace_admin_extensions_router
from apps.api.modules.system.admin.menus.router import router as workspace_menus_router
from apps.api.modules.system.admin.notifications.me_router import router as my_notifications_router
from apps.api.modules.system.admin.notifications.router import router as workspace_notifications_router
from apps.api.modules.workspaces.authz.deps import require_workspace_permission
from apps.api.modules.workspaces.authz.router import router as workspace_authz_router
from apps.api.modules.workspaces.content.router import router as workspace_content_router
from apps.api.modules.workspaces.deps import (
    WorkspaceContext,
    get_workspace_context,
    require_workspace_manage_access,
)
from apps.api.modules.workspaces.plugins_center.router import router as workspace_plugins_center_router
from apps.api.modules.workspaces.rbac.router import router as workspace_rbac_router
from apps.api.modules.workspaces.schema import (
    LeaveWorkspaceRequest,
    LeaveWorkspaceResult,
    MyWorkspaceListResult,
    WorkspaceDeleteResult,
    WorkspaceDetailOut,
    WorkspaceUpdateRequest,
)
from apps.api.modules.workspaces.service import WorkspaceService
from apps.api.modules.workspaces.settings.router import router as workspace_settings_router
from apps.api.modules.workspaces.site.router import router as workspace_site_router
from apps.api.modules.workspaces.team.router import router as workspace_team_router
from apps.api.modules.workspaces.themes.router import router as workspace_themes_router

router = APIRouter(tags=["Workspaces"])
router.include_router(workspace_team_router)
router.include_router(workspace_settings_router)
router.include_router(workspace_authz_router)
router.include_router(workspace_rbac_router)
router.include_router(workspace_assets_router)
router.include_router(workspace_uploads_router)
router.include_router(workspace_usages_router)
router.include_router(workspace_notifications_router)
router.include_router(my_notifications_router)
router.include_router(workspace_menus_router)
router.include_router(workspace_admin_extensions_router)
router.include_router(workspace_themes_router)
router.include_router(workspace_content_router)
router.include_router(workspace_site_router)
router.include_router(workspace_activity_router)
router.include_router(workspace_plugins_center_router)


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
    summary="Update workspace metadata (name)",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def update_workspace(
    payload: WorkspaceUpdateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceDetailOut]:
    service = WorkspaceService(settings)
    detail = await service.update_workspace(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return Response.success(data=detail)


@router.post(
    "/workspaces/{workspace_id}/leave",
    response_model=ResponseModel[LeaveWorkspaceResult],
    summary="Leave current workspace",
)
async def leave_workspace(
    payload: LeaveWorkspaceRequest,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[LeaveWorkspaceResult]:
    service = WorkspaceService(settings)
    out = await service.leave_workspace(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        user_id=user_id,
        confirm_text=payload.confirm_text,
    )
    return Response.success(data=out)


@router.delete(
    "/workspaces/{workspace_id}",
    response_model=ResponseModel[WorkspaceDeleteResult],
    summary="Delete workspace",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def delete_workspace(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    orgm: OrgMembership = Depends(get_current_org_membership),
    user_id: UUID = Depends(get_current_user_id),
    confirm_name: str | None = Query(
        default=None,
        alias="confirmName",
        description="Workspace name confirmation for destructive delete.",
        min_length=1,
        max_length=128,
    ),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceDeleteResult]:
    service = OrganizationWorkspaceService(settings)
    out = await service.delete_workspace(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        user_id=user_id,
        org_role=orgm.role,
        confirm_name=confirm_name or "",
    )
    return Response.success(
        data=WorkspaceDeleteResult(
            workspace_id=UUID(str(out.workspace_id)),
            deleted=out.deleted,
        )
    )
