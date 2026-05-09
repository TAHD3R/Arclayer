from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from src.config import Settings, get_settings
from src.core.http.pagination import DependsPagination, PageData, PageParams
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.analytics.workspaces.router import router as workspace_activity_router
from src.modules.auth.http.service import get_current_user_id
from src.modules.system.admin.router import router as workspace_admin_router
from src.modules.workspaces.api_keys.router import me_api_keys_router
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.authz.router import router as workspace_authz_router
from src.modules.workspaces.danger_service import WorkspaceDangerService
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import get_workspace_context, require_workspace_manage_access
from src.modules.workspaces.rbac.router import router as workspace_rbac_router
from src.modules.workspaces.schema import (
    LeaveWorkspaceRequest,
    LeaveWorkspaceResult,
    MyWorkspaceListResult,
    OnboardingWorkspaceCreateOut,
    OnboardingWorkspaceCreateRequest,
    WorkspaceDangerCapabilitiesOut,
    WorkspaceDeleteResult,
    WorkspaceDetailOut,
    WorkspaceManageArchiveResult,
    WorkspaceManageCreateRequest,
    WorkspaceManageListItemOut,
    WorkspaceUpdateRequest,
)
from src.modules.workspaces.service import WorkspaceService
from src.modules.workspaces.settings.router import router as workspace_settings_router
from src.modules.workspaces.team.router import router as workspace_team_router
from src.modules.workspaces.uploads_router import router as workspace_uploads_router

router = APIRouter(tags=["domain.workspaces"])
router.include_router(me_api_keys_router)
router.include_router(workspace_team_router)
router.include_router(workspace_settings_router)
router.include_router(workspace_authz_router)
router.include_router(workspace_rbac_router)
router.include_router(workspace_uploads_router)
router.include_router(workspace_admin_router)
router.include_router(workspace_activity_router)


@router.get(
    "/workspaces",
    response_model=ResponseModel[PageData[WorkspaceManageListItemOut]],
    summary="List workspaces in the current governance scope",
)
async def list_workspaces(
    user_id: UUID = Depends(get_current_user_id),
    params: PageParams = DependsPagination,
    q: str | None = Query(default=None, description="Search query by workspace name."),
    ordering: str | None = Query(default=None, description="Ordering fields, e.g. -created_at, name."),
    archived: bool | None = Query(default=None, description="Filter archived status when provided."),
    enterable_only: bool = Query(default=False, description="Only include enterable workspaces."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[WorkspaceManageListItemOut]]:
    """List workspaces in the current governance scope."""
    service = WorkspaceService(settings)
    data = await service.list_manage_workspaces(
        user_id=user_id,
        params=params,
        q=q,
        ordering=ordering,
        archived=archived,
        enterable_only=enterable_only,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/workspaces",
    response_model=ResponseModel[WorkspaceManageListItemOut],
    summary="Create workspace in the current governance scope",
)
async def create_workspace(
    payload: WorkspaceManageCreateRequest,
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceManageListItemOut]:
    """Create workspace in the current governance scope."""
    service = WorkspaceService(settings)
    out = await service.create_manage_workspace(user_id=user_id, payload=payload)
    return ApiResponse.success(data=out)


@router.get(
    "/me/workspaces",
    response_model=ResponseModel[MyWorkspaceListResult],
    summary="List workspaces visible to current user",
)
async def list_my_workspaces(
    user_id=Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[MyWorkspaceListResult]:
    """List workspaces visible to current user."""
    service = WorkspaceService(settings)
    result = await service.list_my_workspaces(user_id=user_id)
    return ApiResponse.success(data=result)


@router.post(
    "/me/workspaces/onboarding",
    response_model=ResponseModel[OnboardingWorkspaceCreateOut],
    summary="Create the workspace selected during onboarding",
)
async def create_my_onboarding_workspace(
    payload: OnboardingWorkspaceCreateRequest,
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[OnboardingWorkspaceCreateOut]:
    service = WorkspaceService(settings)
    result = await service.create_onboarding_workspace(user_id=user_id, payload=payload)
    return ApiResponse.success(data=result)


@router.get(
    "/workspaces/{workspace_id}",
    response_model=ResponseModel[WorkspaceDetailOut],
    summary="Get workspace metadata",
    dependencies=[require_workspace_permission("system:settings:read")],
)
async def get_workspace_detail(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceDetailOut]:
    """Get workspace metadata."""
    service = WorkspaceService(settings)
    detail = await service.get_workspace_detail(organization_id=ctx.organization_id, workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=detail)


@router.get(
    "/workspaces/{workspace_id}/danger-capabilities",
    response_model=ResponseModel[WorkspaceDangerCapabilitiesOut],
    summary="Get workspace danger capabilities for current user",
)
async def get_workspace_danger_capabilities(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceDangerCapabilitiesOut]:
    """Get workspace danger capabilities for current user."""
    service = WorkspaceDangerService(settings)
    out = await service.get_capabilities(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        user_id=user_id,
    )
    return ApiResponse.success(data=out)


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
    """Update workspace metadata (name)."""
    service = WorkspaceService(settings)
    detail = await service.update_workspace(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=detail)


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
    """Leave current workspace."""
    service = WorkspaceService(settings)
    out = await service.leave_workspace(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        user_id=user_id,
        confirm_text=payload.confirm_text,
    )
    return ApiResponse.success(data=out)


@router.delete(
    "/workspaces/{workspace_id}",
    response_model=ResponseModel[WorkspaceDeleteResult],
    summary="Delete workspace",
    dependencies=[
        require_workspace_permission("system:settings:manage", error_code="WORKSPACE_SETTINGS_MANAGE_REQUIRED")
    ],
)
async def delete_workspace(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
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
    """Delete workspace."""
    service = WorkspaceService(settings)
    out = await service.delete_manage_workspace(
        user_id=user_id,
        workspace_id=ctx.workspace_id,
        confirm_name=confirm_name or "",
    )
    return ApiResponse.success(
        data=WorkspaceDeleteResult(workspace_id=UUID(str(out.workspace_id)), deleted=out.deleted)
    )


@router.post(
    "/workspaces/{workspace_id}/archive",
    response_model=ResponseModel[WorkspaceManageArchiveResult],
    summary="Archive workspace",
)
async def archive_workspace(
    workspace_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceManageArchiveResult]:
    """Archive workspace."""
    service = WorkspaceService(settings)
    out = await service.archive_manage_workspace(user_id=user_id, workspace_id=workspace_id)
    return ApiResponse.success(data=out)


@router.post(
    "/workspaces/{workspace_id}/unarchive",
    response_model=ResponseModel[WorkspaceManageArchiveResult],
    summary="Unarchive workspace",
)
async def unarchive_workspace(
    workspace_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceManageArchiveResult]:
    """Unarchive workspace."""
    service = WorkspaceService(settings)
    out = await service.unarchive_manage_workspace(user_id=user_id, workspace_id=workspace_id)
    return ApiResponse.success(data=out)
