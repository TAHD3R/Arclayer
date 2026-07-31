from __future__ import annotations

from uuid import UUID

from fastapi import Depends

from src.config import Settings, get_settings
from src.modules.commerce.dunning.command_policy import build_restricted_recovery_command_policy
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.permissions import PermissionConditionSet
from src.modules.projects.authz.router_helpers import (
    ensure_project_permission_granted as ensure_project_authz_permission_granted,
)
from src.modules.projects.authz.router_helpers import (
    require_project_permission as require_project_authz_permission,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.service import ProjectRuntimeContext, ProjectRuntimeService
from src.modules.workspaces.http.schema import WorkspaceContext


def get_project_runtime_service(
    settings: Settings = Depends(get_settings),
) -> ProjectRuntimeService:
    return ProjectRuntimeService(settings)


def workspace_context_from_project(ctx: ProjectRequestContext) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        access_type=ctx.access_type,
        org_membership_id=ctx.org_membership_id,
        is_org_owner=ctx.is_org_owner,
        workspace_membership_id=ctx.workspace_membership_id,
        is_workspace_owner=ctx.is_workspace_owner,
    )


async def ensure_project_permission_granted(
    permission: str,
    *,
    user_id: UUID,
    ctx: ProjectRequestContext,
    error_code: str = "PERMISSION_DENIED",
    resource_attributes: dict[str, str | int | bool | None] | None = None,
    permission_conditions: dict[str, list[PermissionConditionSet]] | None = None,
    action_conditions: dict[str, list[PermissionConditionSet]] | None = None,
) -> None:
    await ensure_project_authz_permission_granted(
        permission,
        user_id=user_id,
        ctx=ctx,
        error_code=error_code,
        resource_attributes=resource_attributes,
        permission_conditions=permission_conditions,
        action_conditions=action_conditions,
    )


def require_project_permission(permission: str, *, error_code: str = "PERMISSION_DENIED"):
    return require_project_authz_permission(permission, error_code=error_code)


def require_project_commercial_effect(effect: RestrictedRecoveryEffect):
    async def authorize(ctx: ProjectRequestContext = Depends(get_project_context)) -> None:
        await build_restricted_recovery_command_policy().authorize(
            workspace_id=ctx.workspace_id,
            effects={effect},
        )

    return Depends(authorize)


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
