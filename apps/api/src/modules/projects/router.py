from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest, Forbidden
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.api_keys.router import router as projects_api_keys_router
from src.modules.projects.assets.router import router as projects_assets_router
from src.modules.projects.authz.router_helpers import (
    ensure_project_permission_granted as ensure_project_authz_permission_granted,
)
from src.modules.projects.automation.router import router as projects_automation_router
from src.modules.projects.content.router import router as projects_content_router
from src.modules.projects.databases.router import router as projects_databases_router
from src.modules.projects.deployments.router import router as projects_deployments_router
from src.modules.projects.domains.router import router as projects_domains_router
from src.modules.projects.environments.router import router as projects_environments_router
from src.modules.projects.governance.router import router as projects_governance_router
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.members_schema import ProjectMemberOut, ProjectMemberRoleUpdateRequest
from src.modules.projects.members_service import ProjectMembersService
from src.modules.projects.publish.router import router as projects_publish_router
from src.modules.projects.releases.router import router as projects_releases_router
from src.modules.projects.runtime.router import project_router as projects_runtime_router
from src.modules.projects.schema import (
    ProjectArchiveResult,
    ProjectCreateRequest,
    ProjectDangerCapabilitiesOut,
    ProjectDeleteResult,
    ProjectDetailOut,
    ProjectListItemOut,
    ProjectListOut,
    ProjectSlugAvailabilityOut,
    ProjectUpdateRequest,
)
from src.modules.projects.service import ProjectService
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access, resolve_workspace_context_by_id

router = APIRouter(tags=["domain.projects"])
router.include_router(projects_governance_router)
router.include_router(projects_runtime_router)
router.include_router(projects_api_keys_router)
router.include_router(projects_releases_router)
router.include_router(projects_publish_router)
router.include_router(projects_environments_router)
router.include_router(projects_deployments_router)
router.include_router(projects_databases_router)
router.include_router(projects_content_router)
router.include_router(projects_assets_router)
router.include_router(projects_automation_router)
router.include_router(projects_domains_router)


async def get_project_list_workspace_context(
    workspace_id: Annotated[PublicUUID, Query(..., alias="workspaceId", description="Workspace id.")],
    user_id: UUID = Depends(get_current_user_id),
) -> WorkspaceContext:
    return await resolve_workspace_context_by_id(workspace_id=workspace_id, user_id=user_id)


async def get_project_create_workspace_context(
    payload: Annotated[ProjectCreateRequest, Body(...)],
    user_id: UUID = Depends(get_current_user_id),
) -> WorkspaceContext:
    return await resolve_workspace_context_by_id(workspace_id=payload.workspace_id, user_id=user_id)


async def get_project_slug_workspace_context(
    workspace_id: Annotated[PublicUUID, Query(..., alias="workspaceId", description="Workspace id.")],
    user_id: UUID = Depends(get_current_user_id),
) -> WorkspaceContext:
    return await resolve_workspace_context_by_id(workspace_id=workspace_id, user_id=user_id)


async def require_project_team_permission(
    permission: str,
    *,
    ctx: ProjectRequestContext,
    user_id: UUID,
) -> None:
    await ensure_project_authz_permission_granted(
        permission,
        user_id=user_id,
        ctx=ctx,
        error_code="PERMISSION_DENIED",
    )


@router.get(
    "/projects",
    response_model=ResponseModel[ProjectListOut],
    summary="List projects",
)
async def list_projects(
    q: str | None = Query(default=None, description="Search query (project name)."),
    archived: bool = Query(default=False, description="Whether to list archived projects."),
    params: PageParams = Depends(get_page_params),
    user_id: UUID = Depends(get_current_user_id),
    workspace_id: PublicUUID | None = Query(default=None, alias="workspaceId", description="Workspace id."),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectListOut]:
    service = ProjectService(settings)
    page = await service.list_projects(
        workspace_id=UUID(str(workspace_id)) if workspace_id is not None else None,
        actor_user_id=user_id,
        params=params,
        q=q,
        archived=archived,
    )
    return ApiResponse.success(data=page)


@router.post(
    "/projects",
    response_model=ResponseModel[ProjectListItemOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create a project",
)
async def create_project(
    payload: ProjectCreateRequest,
    user_id: UUID = Depends(get_current_user_id),
    ctx: WorkspaceContext = Depends(get_project_create_workspace_context),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectListItemOut]:
    if ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")
    ctx = await require_workspace_manage_access(ctx)
    await ensure_workspace_permission_granted("system:content:manage", user_id=user_id, ctx=ctx)
    service = ProjectService(settings)
    project = await service.create_project(
        workspace_id=ctx.workspace_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=project)


@router.get(
    "/projects/slug-availability",
    response_model=ResponseModel[ProjectSlugAvailabilityOut],
    summary="Check project slug availability",
)
async def check_project_slug_availability(
    slug: str = Query(..., min_length=1, max_length=64, description="Desired project slug."),
    project_id: PublicUUID | None = Query(
        default=None,
        alias="projectId",
        description="Project id to exclude when editing an existing project.",
    ),
    ctx: WorkspaceContext = Depends(get_project_slug_workspace_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectSlugAvailabilityOut]:
    await ensure_workspace_permission_granted("system:content:manage", user_id=user_id, ctx=ctx)
    service = ProjectService(settings)
    out = await service.check_slug_availability(
        workspace_id=ctx.workspace_id,
        slug=slug,
        exclude_project_id=UUID(str(project_id)) if project_id is not None else None,
    )
    return ApiResponse.success(data=out)


@router.get(
    "/projects/{project_id}",
    response_model=ResponseModel[ProjectDetailOut],
    summary="Get project detail",
)
async def get_project_detail(
    ctx: ProjectRequestContext = Depends(get_project_context),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectDetailOut]:
    """Get project detail."""

    service = ProjectService(settings)
    detail = await service.get_project_detail(project_id=ctx.project_id)
    return ApiResponse.success(data=detail)


@router.get(
    "/projects/{project_id}/danger-capabilities",
    response_model=ResponseModel[ProjectDangerCapabilitiesOut],
    summary="Get project danger capabilities for current user",
)
async def get_project_danger_capabilities(
    ctx: ProjectRequestContext = Depends(get_project_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectDangerCapabilitiesOut]:
    try:
        await require_project_team_permission("project:settings:manage", ctx=ctx, user_id=user_id)
        can_manage_settings = True
    except Forbidden:
        can_manage_settings = False

    service = ProjectService(settings)
    out = await service.get_danger_capabilities(
        project_id=ctx.project_id,
        can_manage_settings=can_manage_settings,
    )
    return ApiResponse.success(data=out)


@router.patch(
    "/projects/{project_id}",
    response_model=ResponseModel[ProjectDetailOut],
    summary="Update project metadata",
)
async def update_project(
    payload: ProjectUpdateRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectDetailOut]:
    await require_project_team_permission("project:settings:manage", ctx=ctx, user_id=user_id)
    service = ProjectService(settings)
    detail = await service.update_project(project_id=ctx.project_id, payload=payload, actor_user_id=user_id)
    return ApiResponse.success(data=detail)


@router.post(
    "/projects/{project_id}/archive",
    response_model=ResponseModel[ProjectArchiveResult],
    summary="Archive project",
)
async def archive_project(
    ctx: ProjectRequestContext = Depends(get_project_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectArchiveResult]:
    await require_project_team_permission("project:settings:manage", ctx=ctx, user_id=user_id)
    service = ProjectService(settings)
    out = await service.archive_project(project_id=ctx.project_id, actor_user_id=user_id)
    return ApiResponse.success(data=out)


@router.post(
    "/projects/{project_id}/unarchive",
    response_model=ResponseModel[ProjectArchiveResult],
    summary="Restore project",
)
async def unarchive_project(
    ctx: ProjectRequestContext = Depends(get_project_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectArchiveResult]:
    await require_project_team_permission("project:settings:manage", ctx=ctx, user_id=user_id)
    service = ProjectService(settings)
    out = await service.unarchive_project(project_id=ctx.project_id)
    return ApiResponse.success(data=out)


@router.delete(
    "/projects/{project_id}",
    response_model=ResponseModel[ProjectDeleteResult],
    summary="Delete project",
)
async def delete_project(
    confirm_name: str | None = Query(
        default=None,
        alias="confirmName",
        description="Project name confirmation for destructive delete.",
        min_length=1,
        max_length=128,
    ),
    ctx: ProjectRequestContext = Depends(get_project_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectDeleteResult]:
    await require_project_team_permission("project:settings:manage", ctx=ctx, user_id=user_id)
    service = ProjectService(settings)
    detail = await service.get_project_detail(project_id=ctx.project_id)
    if (confirm_name or "").strip() != detail.project.name:
        raise BadRequest("Project delete confirmation does not match", error="PROJECT_DELETE_CONFIRM_NAME_MISMATCH")
    out = await service.delete_project(project_id=ctx.project_id, actor_user_id=user_id)
    return ApiResponse.success(data=out)


@router.get(
    "/projects/{project_id}/members",
    response_model=ResponseModel[PageData[ProjectMemberOut]],
    summary="List project members",
)
async def list_project_members(
    q: str | None = Query(default=None, description="Search query (username/email/display_name)."),
    params: PageParams = Depends(get_page_params),
    ctx: ProjectRequestContext = Depends(get_project_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[ProjectMemberOut]]:
    await require_project_team_permission("project:team:members:read", ctx=ctx, user_id=user_id)
    service = ProjectMembersService(settings)
    page = await service.list_members(
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        params=params,
        q=q,
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=page)


@router.put(
    "/projects/{project_id}/members/{membership_id}/role",
    response_model=ResponseModel[ProjectMemberOut],
    summary="Update project member role",
)
async def update_project_member_role(
    membership_id: UUID,
    payload: ProjectMemberRoleUpdateRequest,
    ctx: ProjectRequestContext = Depends(get_project_context),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectMemberOut]:
    await require_project_team_permission("project:team:roles:manage", ctx=ctx, user_id=user_id)
    service = ProjectMembersService(settings)
    member = await service.update_member_role(
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        membership_id=membership_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=member)
