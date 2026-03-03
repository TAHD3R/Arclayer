from __future__ import annotations

from uuid import UUID

from apps.api.src.modules.system.models.rbac import Permission, PermissionScope, Role
from apps.api.src.modules.workspaces.authz.schema import AuthzSnapshot


async def get_workspace_authz_snapshot(*, user_id: UUID, workspace_id: UUID) -> AuthzSnapshot:
    """
    Build a workspace-scoped authz snapshot.

    Notes:
    - WorkspaceMembershipRole is the binding between a user (via membership) and roles.
    - Superuser roles grant all permissions.
    """

    roles = (
        await Role
        .filter(
            workspace_membership_roles__membership__workspace_id=workspace_id,
            workspace_membership_roles__membership__user_id=user_id,
            workspace_membership_roles__membership__status="active",
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
        perms = await Permission.filter(scope=PermissionScope.WORKSPACE).order_by("code").all()
        permission_codes = [p.code for p in perms if p and p.code]
        return AuthzSnapshot(
            user_id=user_id,
            role_codes=role_codes,
            permission_codes=permission_codes,
            is_superuser=True,
        )

    perms = (
        await Permission
        .filter(
            scope=PermissionScope.WORKSPACE,
            permission_roles__role__workspace_id=workspace_id,
            permission_roles__role__code__in=role_codes,
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
