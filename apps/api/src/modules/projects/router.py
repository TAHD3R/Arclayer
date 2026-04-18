from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.facade.router import router as projects_facade_router
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.members_schema import ProjectMemberOut, ProjectMemberRoleUpdateRequest
from src.modules.projects.members_service import ProjectMembersService
from src.modules.projects.schema import ProjectCreateRequest, ProjectDetailOut, ProjectListOut
from src.modules.projects.service import ProjectService
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted, require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(tags=["domain.projects"])
router.include_router(projects_facade_router)


async def require_project_team_permission(
    permission: str,
    *,
    ctx: ProjectRequestContext,
    user_id: UUID,
) -> None:
    await ensure_workspace_permission_granted(
        permission,
        user_id=user_id,
        ctx=WorkspaceContext(
            workspace_id=ctx.workspace_id,
            organization_id=ctx.organization_id,
            workspace_kind=ctx.workspace_kind,
            access_type=ctx.access_type,
            org_membership_id=ctx.org_membership_id,
            is_org_owner=ctx.is_org_owner,
            workspace_membership_id=ctx.workspace_membership_id,
            visible_only=ctx.visible_only,
            is_creator_admin=ctx.is_creator_admin,
        ),
        error_code="PERMISSION_DENIED",
    )


@router.get(
    "/workspaces/{workspace_id}/projects",
    response_model=ResponseModel[ProjectListOut],
    summary="List projects in the current workspace",
    dependencies=[require_workspace_permission("system:content:read")],
)
async def list_workspace_projects(
    q: str | None = Query(default=None, description="Search query (project name)."),
    params: PageParams = Depends(get_page_params),
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectListOut]:
    service = ProjectService(settings)
    page = await service.list_projects(workspace_id=ctx.workspace_id, params=params, q=q)
    return ApiResponse.success(data=page)


@router.post(
    "/workspaces/{workspace_id}/projects",
    response_model=ResponseModel[ProjectDetailOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create a project in the current workspace",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def create_workspace_project(
    payload: ProjectCreateRequest,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[ProjectDetailOut]:
    service = ProjectService(settings)
    detail = await service.create_project(
        workspace_id=ctx.workspace_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=detail)


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
    await require_project_team_permission("team:members:read", ctx=ctx, user_id=user_id)
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
    await require_project_team_permission("team:members:roles:manage", ctx=ctx, user_id=user_id)
    service = ProjectMembersService(settings)
    member = await service.update_member_role(
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        membership_id=membership_id,
        payload=payload,
        actor_user_id=user_id,
    )
    return ApiResponse.success(data=member)
