from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import Depends, Path

from src.common.protocols.tortoise import HasOrganizationId, HasWorkspaceId
from src.common.types.public_uuid import PublicUUID
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.repository import ProjectRepository
from src.modules.tenancy.router_helpers import bind_project_tenant_context
from src.modules.tenancy.schema import TenantScope
from src.modules.workspaces.http.service import (
    find_active_org_membership,
    require_active_workspace,
    resolve_guest_workspace_context,
    resolve_member_workspace_context,
)


async def get_project_context(
    project_id: Annotated[PublicUUID, Path(..., description="Project ID.")],
    user_id: UUID = Depends(get_current_user_id),
) -> ProjectRequestContext:
    """Resolve project request context."""

    context = await resolve_project_context_by_id(project_id=UUID(str(project_id)), user_id=user_id)
    bind_project_tenant_context(
        project_id=context.project_id,
        runtime_id=context.runtime_id,
        scope=TenantScope.PROJECT,
    )
    return context


async def resolve_project_context_by_id(
    *,
    project_id: UUID,
    user_id: UUID,
) -> ProjectRequestContext:
    """Resolve canonical Project membership context without mutating request/Job tenant scope."""

    repo = ProjectRepository()
    project = await repo.get_project_by_id(project_id=project_id)
    workspace_id = UUID(str(cast(HasWorkspaceId, project).workspace_id))
    workspace = await require_active_workspace(workspace_id=workspace_id)
    organization_id = UUID(str(cast(HasOrganizationId, workspace).organization_id))

    orgm = await find_active_org_membership(organization_id=organization_id, user_id=user_id)
    if orgm is None:
        workspace_ctx = await resolve_guest_workspace_context(
            workspace=workspace,
            organization_id=organization_id,
            user_id=user_id,
        )
    else:
        workspace_ctx = await resolve_member_workspace_context(
            workspace=workspace,
            organization_id=organization_id,
            user_id=user_id,
            orgm=orgm,
        )

    runtime = await repo.get_primary_runtime(project_id=project.id)
    return ProjectRequestContext(
        project_id=project.id,
        workspace_id=workspace_id,
        organization_id=organization_id,
        runtime_id=runtime.id if runtime is not None else None,
        workspace_kind=workspace_ctx.workspace_kind,
        access_type=workspace_ctx.access_type,
        org_membership_id=workspace_ctx.org_membership_id,
        is_org_owner=workspace_ctx.is_org_owner,
        workspace_membership_id=workspace_ctx.workspace_membership_id,
        visible_only=workspace_ctx.visible_only,
        is_creator_admin=workspace_ctx.is_creator_admin,
    )
