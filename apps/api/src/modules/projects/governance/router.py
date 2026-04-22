from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.settings.schema import ProjectSettingsDetail, ProjectSettingsPatch
from src.modules.projects.settings.service import ProjectSettingsService
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.authz.schema import AuthzSnapshot
from src.modules.workspaces.authz.snapshot.service import get_workspace_authz_snapshot
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.permissions import get_permission_action_registry
from src.modules.workspaces.rbac.schema import WorkspacePermissionActionOut

router = APIRouter(prefix="/projects/{project_id}", tags=["domain.projects.governance"])


def get_project_settings_service(settings: Settings = Depends(get_settings)) -> ProjectSettingsService:
    return ProjectSettingsService(settings)


def _workspace_context_for_project(
    *,
    ctx: ProjectRequestContext,
) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        workspace_kind=ctx.workspace_kind,
        access_type=ctx.access_type,
        org_membership_id=ctx.org_membership_id,
        is_org_owner=ctx.is_org_owner,
        workspace_membership_id=ctx.workspace_membership_id,
        visible_only=ctx.visible_only,
        is_creator_admin=ctx.is_creator_admin,
    )


@router.get(
    "/me/authz",
    response_model=ResponseModel[AuthzSnapshot],
    summary="Get project-scoped authz snapshot for current user",
)
async def get_project_authz_snapshot(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
) -> ResponseModel[AuthzSnapshot]:
    snapshot = await get_workspace_authz_snapshot(user_id=user_id, workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=snapshot)


@router.get(
    "/actions",
    response_model=ResponseModel[list[WorkspacePermissionActionOut]],
    summary="List canonical permission actions for current project context",
)
async def list_project_actions(
    _ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
) -> ResponseModel[list[WorkspacePermissionActionOut]]:
    _ = user_id
    items = [
        WorkspacePermissionActionOut(
            code=action,
            description=definition.description,
            subject_kinds=list(definition.subject_kinds),
            permission_codes=list(definition.permission_codes),
        )
        for action, definition in sorted(get_permission_action_registry().items(), key=lambda entry: entry[0])
    ]
    return ApiResponse.success(data=items)


@router.get(
    "/settings/core",
    response_model=ResponseModel[ProjectSettingsDetail],
    summary="Get project core settings",
)
async def get_project_core_settings(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectSettingsService, Depends(get_project_settings_service)],
) -> ResponseModel[ProjectSettingsDetail]:
    await ensure_workspace_permission_granted(
        "system:settings:read",
        user_id=user_id,
        ctx=_workspace_context_for_project(ctx=ctx),
    )
    detail = await service.get_core_detail(project_id=ctx.project_id)
    return ApiResponse.success(data=detail)


@router.patch(
    "/settings/core",
    response_model=ResponseModel[ProjectSettingsDetail],
    summary="Patch project core settings",
)
async def patch_project_core_settings(
    payload: ProjectSettingsPatch,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectSettingsService, Depends(get_project_settings_service)],
) -> ResponseModel[ProjectSettingsDetail]:
    await ensure_workspace_permission_granted(
        "system:settings:manage",
        user_id=user_id,
        ctx=_workspace_context_for_project(ctx=ctx),
    )
    detail = await service.patch_core(
        project_id=ctx.project_id,
        patch=payload.patch or {},
        updated_by=user_id,
    )
    return ApiResponse.success(data=detail)
