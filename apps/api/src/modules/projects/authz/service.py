from __future__ import annotations

from uuid import UUID

from src.modules.projects.authz.schema import ProjectAuthzSnapshot
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.workspaces.authz.http.service import _build_workspace_authz_snapshot
from src.modules.workspaces.http.schema import WorkspaceContext


def project_context_to_workspace_context(ctx: ProjectRequestContext) -> WorkspaceContext:
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


async def get_project_authz_snapshot(
    *,
    ctx: ProjectRequestContext,
    user_id: UUID,
) -> ProjectAuthzSnapshot:
    workspace_snapshot = await _build_workspace_authz_snapshot(
        user_id=user_id,
        workspace_id=ctx.workspace_id,
    )
    return ProjectAuthzSnapshot(
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        user_id=user_id,
        role_codes=list(workspace_snapshot.role_codes),
        permission_codes=list(workspace_snapshot.permission_codes),
        is_superuser=workspace_snapshot.is_superuser,
    )
