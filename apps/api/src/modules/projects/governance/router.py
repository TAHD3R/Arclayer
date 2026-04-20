from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.authz.schema import AuthzSnapshot
from src.modules.workspaces.authz.snapshot.service import get_workspace_authz_snapshot
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.settings.schema import WorkspaceSettingsDetail, WorkspaceSettingsPatch
from src.modules.workspaces.settings.service import WorkspaceSettingsService

router = APIRouter(prefix="/projects/{project_id}", tags=["domain.projects.governance"])


def get_project_settings_service(settings: Settings = Depends(get_settings)) -> WorkspaceSettingsService:
    return WorkspaceSettingsService(settings)


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
    "/settings/core",
    response_model=ResponseModel[WorkspaceSettingsDetail],
    summary="Get project core settings",
)
async def get_project_core_settings(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceSettingsService, Depends(get_project_settings_service)],
) -> ResponseModel[WorkspaceSettingsDetail]:
    await ensure_workspace_permission_granted(
        "system:settings:read",
        user_id=user_id,
        ctx=_workspace_context_for_project(ctx=ctx),
    )
    detail = await service.get_core_detail(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=detail)


@router.patch(
    "/settings/core",
    response_model=ResponseModel[WorkspaceSettingsDetail],
    summary="Patch project core settings",
)
async def patch_project_core_settings(
    payload: WorkspaceSettingsPatch,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceSettingsService, Depends(get_project_settings_service)],
) -> ResponseModel[WorkspaceSettingsDetail]:
    await ensure_workspace_permission_granted(
        "system:settings:manage",
        user_id=user_id,
        ctx=_workspace_context_for_project(ctx=ctx),
    )
    detail = await service.patch_core(
        workspace_id=ctx.workspace_id,
        patch=payload.patch or {},
        updated_by=user_id,
    )
    return ApiResponse.success(data=detail)
