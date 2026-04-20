from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends

from src.config import Settings, get_settings
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime_bridge.service import ProjectRuntimeBridgeService
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.schema import WorkspaceContext


@dataclass(slots=True)
class ProjectContentRouteContext:
    project_ctx: ProjectRequestContext
    workspace_ctx: WorkspaceContext
    project_id: UUID
    workspace_id: UUID
    organization_id: UUID
    runtime_id: UUID
    site_id: UUID


def _to_workspace_context(ctx: ProjectRequestContext) -> WorkspaceContext:
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


async def _build_project_content_route_context(
    *,
    permission: str,
    ctx: ProjectRequestContext,
    user_id: UUID,
    settings: Settings,
) -> ProjectContentRouteContext:
    workspace_ctx = _to_workspace_context(ctx)
    await ensure_workspace_permission_granted(
        permission,
        user_id=user_id,
        ctx=workspace_ctx,
        error_code="PERMISSION_DENIED",
    )
    runtime_context = await ProjectRuntimeBridgeService(settings).get_context(
        project_id=ctx.project_id,
        actor_user_id=user_id,
    )
    return ProjectContentRouteContext(
        project_ctx=ctx,
        workspace_ctx=workspace_ctx,
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        runtime_id=runtime_context.runtime_id,
        site_id=runtime_context.site_id,
    )


async def require_project_content_read_context(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Settings = Depends(get_settings),
) -> ProjectContentRouteContext:
    return await _build_project_content_route_context(
        permission="system:content:read",
        ctx=ctx,
        user_id=user_id,
        settings=settings,
    )


async def require_project_content_manage_context(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Settings = Depends(get_settings),
) -> ProjectContentRouteContext:
    return await _build_project_content_route_context(
        permission="system:content:manage",
        ctx=ctx,
        user_id=user_id,
        settings=settings,
    )


async def require_project_content_publish_context(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Settings = Depends(get_settings),
) -> ProjectContentRouteContext:
    return await _build_project_content_route_context(
        permission="system:content:publish",
        ctx=ctx,
        user_id=user_id,
        settings=settings,
    )
