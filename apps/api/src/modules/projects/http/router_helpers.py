from __future__ import annotations

from uuid import UUID

from fastapi import Depends

from src.config import Settings, get_settings
from src.modules.projects.authz.router_helpers import (
    ensure_project_permission_granted as ensure_project_authz_permission_granted,
)
from src.modules.projects.authz.router_helpers import (
    require_project_permission as require_project_authz_permission,
)
from src.modules.projects.authz.service import project_context_to_workspace_context
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.runtime.service import ProjectRuntimeContext, ProjectRuntimeService
from src.modules.workspaces.http.schema import WorkspaceContext


def get_project_runtime_service(
    settings: Settings = Depends(get_settings),
) -> ProjectRuntimeService:
    return ProjectRuntimeService(settings)


def workspace_context_from_project(ctx: ProjectRequestContext) -> WorkspaceContext:
    return project_context_to_workspace_context(ctx)


async def ensure_project_permission_granted(
    permission: str,
    *,
    user_id: UUID,
    ctx: ProjectRequestContext,
    error_code: str = "PERMISSION_DENIED",
) -> None:
    await ensure_project_authz_permission_granted(
        permission,
        user_id=user_id,
        ctx=ctx,
        error_code=error_code,
    )


def require_project_permission(permission: str, *, error_code: str = "PERMISSION_DENIED"):
    return require_project_authz_permission(permission, error_code=error_code)


async def get_project_runtime_context(
    *,
    ctx: ProjectRequestContext,
    actor_user_id: UUID,
    runtime_service: ProjectRuntimeService,
) -> ProjectRuntimeContext:
    return await runtime_service.get_context_by_project(
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
    )
