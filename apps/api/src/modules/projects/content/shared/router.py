from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Query
from pydantic import BaseModel

from src.models.projects.environment import ProjectEnvironmentKey
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.command_policy import build_restricted_recovery_command_policy
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.projects.environments.service import ProjectEnvironmentsService
from src.modules.projects.http.router_helpers import (
    ensure_project_permission_granted,
    get_project_runtime_context,
    get_project_runtime_service,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.service import ProjectRuntimeContext, ProjectRuntimeService


class ProjectContentRouteContext(BaseModel):
    project_ctx: ProjectRequestContext
    runtime_ctx: ProjectRuntimeContext
    project_id: UUID
    workspace_id: UUID
    organization_id: UUID
    runtime_id: UUID
    site_id: UUID
    environment_id: UUID
    environment_key: str


async def _build_project_content_route_context(
    *,
    permission: str,
    ctx: ProjectRequestContext,
    user_id: UUID,
    runtime_service: ProjectRuntimeService,
    environment: str | None,
    environment_id: UUID | None,
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
    environment_service = ProjectEnvironmentsService(runtime_context.tenant_context)
    environment_target = await environment_service.resolve_environment_target(
        project_id=ctx.project_id,
        target=environment_id or environment,
        default_key=ProjectEnvironmentKey.PRODUCTION,
    )
    return ProjectContentRouteContext(
        project_ctx=ctx,
        runtime_ctx=runtime_context,
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        runtime_id=runtime_context.runtime_id,
        site_id=runtime_context.site_id,
        environment_id=environment_target.id,
        environment_key=str(environment_target.key),
    )


async def require_project_content_read_context(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    environment: Annotated[str | None, Query(description="Environment key, id, or alias.")] = None,
    environment_id: Annotated[UUID | None, Query(alias="environmentId", description="Environment id.")] = None,
    runtime_service: ProjectRuntimeService = Depends(get_project_runtime_service),
) -> ProjectContentRouteContext:
    return await _build_project_content_route_context(
        permission="project:content:read",
        ctx=ctx,
        user_id=user_id,
        environment=environment,
        environment_id=environment_id,
        runtime_service=runtime_service,
    )


async def require_project_content_manage_context(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    environment: Annotated[str | None, Query(description="Environment key, id, or alias.")] = None,
    environment_id: Annotated[UUID | None, Query(alias="environmentId", description="Environment id.")] = None,
    runtime_service: ProjectRuntimeService = Depends(get_project_runtime_service),
) -> ProjectContentRouteContext:
    route_context = await _build_project_content_route_context(
        permission="project:content:manage",
        ctx=ctx,
        user_id=user_id,
        environment=environment,
        environment_id=environment_id,
        runtime_service=runtime_service,
    )
    await build_restricted_recovery_command_policy().authorize(
        workspace_id=route_context.workspace_id,
        effects={RestrictedRecoveryEffect.CONTENT_MUTATION},
    )
    return route_context


async def require_project_content_publish_context(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    environment: Annotated[str | None, Query(description="Environment key, id, or alias.")] = None,
    environment_id: Annotated[UUID | None, Query(alias="environmentId", description="Environment id.")] = None,
    runtime_service: ProjectRuntimeService = Depends(get_project_runtime_service),
) -> ProjectContentRouteContext:
    route_context = await _build_project_content_route_context(
        permission="project:content:publish",
        ctx=ctx,
        user_id=user_id,
        environment=environment,
        environment_id=environment_id,
        runtime_service=runtime_service,
    )
    await build_restricted_recovery_command_policy().authorize(
        workspace_id=route_context.workspace_id,
        effects={RestrictedRecoveryEffect.CONTENT_MUTATION},
    )
    return route_context
