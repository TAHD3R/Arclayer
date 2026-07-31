from __future__ import annotations

from uuid import UUID

from src.models.system.rbac import PermissionScope, SystemPermission, SystemRole
from src.models.workspaces.workspace import Workspace
from src.modules.workspaces.authz.role_management import (
    WorkspaceRoleManagementAvailabilityReader,
    get_fixed_member_permission_codes,
    is_active_workspace_member,
    require_workspace_role_management_decision,
)
from src.modules.workspaces.authz.schema import AuthzSnapshot


async def get_workspace_authz_snapshot(
    *,
    user_id: UUID,
    workspace_id: UUID,
    role_management_reader: WorkspaceRoleManagementAvailabilityReader,
) -> AuthzSnapshot:
    """
    Build a workspace-scoped authz snapshot.

    Notes:
    - WorkspaceMembershipRole is the binding between a user (via membership) and roles.
    - Superuser roles grant all permissions.
    """

    is_workspace_owner = await Workspace.filter(id=workspace_id, owner_user_id=user_id).exists()
    if is_workspace_owner:
        permissions = await SystemPermission.filter(scope=PermissionScope.WORKSPACE).order_by("code").all()
        return AuthzSnapshot(
            user_id=user_id,
            role_codes=[],
            permission_codes=[permission.code for permission in permissions if permission and permission.code],
            is_superuser=False,
            is_workspace_owner=True,
        )

    availability = await require_workspace_role_management_decision(
        workspace_id=workspace_id,
        reader=role_management_reader,
    )
    if not availability.included:
        if not await is_active_workspace_member(user_id=user_id, workspace_id=workspace_id):
            return AuthzSnapshot(user_id=user_id, role_codes=[], permission_codes=[], is_superuser=False)
        return AuthzSnapshot(
            user_id=user_id,
            role_codes=[],
            permission_codes=await get_fixed_member_permission_codes(workspace_id=workspace_id),
            is_superuser=False,
        )

    roles = (
        await SystemRole
        .filter(
            workspace_membership_roles__membership__workspace_id=workspace_id,
            workspace_membership_roles__membership__user_id=user_id,
            workspace_membership_roles__membership__status="active",
            workspace_membership_roles__ended_at=None,
            ended_at=None,
        )
        .distinct()
        .order_by("code")
        .all()
    )
    role_codes = [r.code for r in roles if r and r.code]
    if not role_codes:
        return AuthzSnapshot(user_id=user_id, role_codes=[], permission_codes=[], is_superuser=False)

    is_superuser = any(bool(r.is_superuser) for r in roles)
    if is_superuser:
        perms = await SystemPermission.filter(scope=PermissionScope.WORKSPACE).order_by("code").all()
        permission_codes = [p.code for p in perms if p and p.code]
        return AuthzSnapshot(
            user_id=user_id,
            role_codes=role_codes,
            permission_codes=permission_codes,
            is_superuser=True,
        )

    perms = (
        await SystemPermission
        .filter(
            scope=PermissionScope.WORKSPACE,
            permission_roles__role__workspace_id=workspace_id,
            permission_roles__role__code__in=role_codes,
            permission_roles__role__ended_at=None,
        )
        .distinct()
        .order_by("code")
        .all()
    )
    permission_codes = [p.code for p in perms if p and p.code]
    return AuthzSnapshot(
        user_id=user_id,
        role_codes=role_codes,
        permission_codes=permission_codes,
        is_superuser=False,
    )
