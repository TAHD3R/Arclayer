from __future__ import annotations

from uuid import UUID

from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.modules.projects.authz.schema import ProjectAuthzSnapshot
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.permissions.service import get_project_permission_codes_for_role


async def get_project_authz_snapshot(
    *,
    ctx: ProjectRequestContext,
    user_id: UUID,
) -> ProjectAuthzSnapshot:
    membership = await ProjectMembership.get_or_none(
        project_id=ctx.project_id,
        user_id=user_id,
    )
    if membership is None:
        return ProjectAuthzSnapshot(
            project_id=ctx.project_id,
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            role_codes=[],
            permission_codes=[],
            is_superuser=False,
        )

    role = ProjectMemberRole(str(membership.role))
    role_codes = [role.value]
    permission_codes = list(get_project_permission_codes_for_role(role))
    return ProjectAuthzSnapshot(
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        user_id=user_id,
        role_codes=role_codes,
        permission_codes=permission_codes,
        is_superuser=False,
    )
