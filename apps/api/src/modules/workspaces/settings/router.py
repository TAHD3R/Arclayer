from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_team_workspace_manage_access, require_workspace_manage_access
from src.modules.workspaces.settings.integrations.webhooks.router import router as workspace_webhooks_router
from src.modules.workspaces.settings.schema import (
    WorkspaceAssignRoleToMembersRequest,
    WorkspaceAssignRoleToMembersResult,
    WorkspaceRolePolicyOut,
    WorkspaceRolePolicyPatch,
    WorkspaceSettingsDetail,
    WorkspaceSettingsPatch,
)
from src.modules.workspaces.settings.service import WorkspaceSettingsService

router = APIRouter(prefix="/workspaces/{workspace_id}/settings", tags=["domain.workspaces.settings"])
router.include_router(workspace_webhooks_router)


@router.get(
    "/core",
    response_model=ResponseModel[WorkspaceSettingsDetail],
    summary="Get workspace core settings",
    dependencies=[require_workspace_permission("system:settings:read")],
)
async def get_workspace_core_settings(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceSettingsDetail]:
    """Get workspace core settings."""
    service = WorkspaceSettingsService(settings)
    detail = await service.get_core_detail(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=detail)


@router.patch(
    "/core",
    response_model=ResponseModel[WorkspaceSettingsDetail],
    summary="Patch workspace core settings",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def patch_workspace_core_settings(
    payload: WorkspaceSettingsPatch,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceSettingsDetail]:
    """Patch workspace core settings."""
    service = WorkspaceSettingsService(settings)
    detail = await service.patch_core(workspace_id=ctx.workspace_id, patch=payload.patch or {}, updated_by=user_id)
    return ApiResponse.success(data=detail)


@router.get(
    "/role-policy",
    response_model=ResponseModel[WorkspaceRolePolicyOut],
    summary="Get workspace role policy",
    dependencies=[require_workspace_permission("system:settings:read")],
)
async def get_workspace_role_policy(
    ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceRolePolicyOut]:
    """Get workspace role policy."""
    service = WorkspaceSettingsService(settings)
    out = await service.get_role_policy(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=out)


@router.patch(
    "/role-policy",
    response_model=ResponseModel[WorkspaceRolePolicyOut],
    summary="Patch workspace role policy",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def patch_workspace_role_policy(
    payload: WorkspaceRolePolicyPatch,
    ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceRolePolicyOut]:
    """Patch workspace role policy."""
    service = WorkspaceSettingsService(settings)
    out = await service.patch_role_policy(
        workspace_id=ctx.workspace_id,
        default_role_code=payload.default_role_code,
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=out)


@router.post(
    "/role-policy/assign-all",
    response_model=ResponseModel[WorkspaceAssignRoleToMembersResult],
    summary="Assign role to all regular members in workspace",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def assign_workspace_role_to_regular_members(
    payload: WorkspaceAssignRoleToMembersRequest,
    ctx: WorkspaceContext = Depends(require_team_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceAssignRoleToMembersResult]:
    """Assign role to all regular members in workspace."""
    service = WorkspaceSettingsService(settings)
    out = await service.assign_role_to_regular_members(
        workspace_id=ctx.workspace_id,
        role_code=payload.role_code,
        confirm_name=payload.confirm_name,
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=out)
