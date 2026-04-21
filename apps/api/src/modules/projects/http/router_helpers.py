from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends

from src.config import Settings, get_settings
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.service import ProjectRuntimeContext, ProjectRuntimeService
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.schema import WorkspaceContext


def get_project_runtime_service(
    settings: Settings = Depends(get_settings),
) -> ProjectRuntimeService:
    return ProjectRuntimeService(settings)


def workspace_context_from_project(ctx: ProjectRequestContext) -> WorkspaceContext:
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


async def ensure_project_permission_granted(
    permission: str,
    *,
    user_id: UUID,
    ctx: ProjectRequestContext,
    error_code: str = "PERMISSION_DENIED",
) -> None:
    await ensure_workspace_permission_granted(
        permission,
        user_id=user_id,
        ctx=ctx,
        error_code=error_code,
    )


def require_project_permission(permission: str, *, error_code: str = "PERMISSION_DENIED"):
    async def _dep(
        ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
        user_id: Annotated[UUID, Depends(get_current_user_id)],
    ) -> None:
        await ensure_project_permission_granted(
            permission,
            user_id=user_id,
            ctx=ctx,
            error_code=error_code,
        )

    return Depends(_dep)


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
