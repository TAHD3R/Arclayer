from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends

from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.router_helpers import (
    ensure_project_permission_granted,
    get_project_runtime_context,
    get_project_runtime_service,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.service import ProjectRuntimeContext, ProjectRuntimeService


@dataclass(slots=True)
class ProjectContentRouteContext:
    project_ctx: ProjectRequestContext
    runtime_ctx: ProjectRuntimeContext
    project_id: UUID
    workspace_id: UUID
    organization_id: UUID
    runtime_id: UUID
    site_id: UUID


async def _build_project_content_route_context(
    *,
    permission: str,
    ctx: ProjectRequestContext,
    user_id: UUID,
    runtime_service: ProjectRuntimeService,
) -> ProjectContentRouteContext:
    await ensure_project_permission_granted(
        permission,
        user_id=user_id,
        ctx=ctx,
        error_code="PERMISSION_DENIED",
    )
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=user_id,
        runtime_service=runtime_service,
    )
    return ProjectContentRouteContext(
        project_ctx=ctx,
        runtime_ctx=runtime_context,
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        runtime_id=runtime_context.runtime_id,
        site_id=runtime_context.site_id,
    )


async def require_project_content_read_context(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: ProjectRuntimeService = Depends(get_project_runtime_service),
) -> ProjectContentRouteContext:
    return await _build_project_content_route_context(
        permission="project:content:read",
        ctx=ctx,
        user_id=user_id,
        runtime_service=runtime_service,
    )


async def require_project_content_manage_context(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: ProjectRuntimeService = Depends(get_project_runtime_service),
) -> ProjectContentRouteContext:
    return await _build_project_content_route_context(
        permission="project:content:manage",
        ctx=ctx,
        user_id=user_id,
        runtime_service=runtime_service,
    )


async def require_project_content_publish_context(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: ProjectRuntimeService = Depends(get_project_runtime_service),
) -> ProjectContentRouteContext:
    return await _build_project_content_route_context(
        permission="project:content:publish",
        ctx=ctx,
        user_id=user_id,
        runtime_service=runtime_service,
    )
