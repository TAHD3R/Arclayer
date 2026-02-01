from __future__ import annotations

from uuid import UUID

from fastapi import Depends

from apps.api.core.exceptions import Forbidden
from apps.api.core.i18n import t
from apps.api.core.workspace.deps import WorkspaceContext, require_workspace_manage_access
from apps.api.models.rbac import Permission, PermissionScope, Role
from apps.api.models.workspace import WorkspaceMembershipRole
from apps.api.routers.v1.auth.deps import get_current_user_id


async def _list_user_role_codes_in_workspace(*, user_id: UUID, workspace_id: UUID) -> list[str]:
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
    return [r.code for r in roles if r and r.code]


async def _ensure_creator_admin_has_admin_role(*, ctx: WorkspaceContext, user_id: UUID) -> None:
    """
    Ensure creator-admin has an explicit admin role binding.

    We do this as an idempotent best-effort so downstream permission checks can stay purely role-based.
    """

    if not ctx.is_creator_admin:
        return
    if ctx.workspace_membership_id is None:
        return
    # Creator-admin gets the workspace Owner role by default.
    admin_role = await Role.get_or_none(workspace_id=ctx.workspace_id, code="owner", is_system=True)
    if admin_role is None:
        return
    await WorkspaceMembershipRole.get_or_create(membership_id=ctx.workspace_membership_id, role_id=admin_role.id)


def require_workspace_permission(permission: str):
    """
    Workspace-scoped permission gate.

    Notes:
    - This is intentionally independent from the org-scoped authz engine (v1).
    - v2 uses workspace as the admin governance boundary.
    """

    async def _dep(
        user_id: UUID = Depends(get_current_user_id),
        ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    ) -> None:
        await _ensure_creator_admin_has_admin_role(ctx=ctx, user_id=user_id)

        role_codes = await _list_user_role_codes_in_workspace(user_id=user_id, workspace_id=ctx.workspace_id)
        if not role_codes:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                error="PERMISSION_DENIED",
            )

        # Superuser roles implicitly have all permissions.
        if await Role.filter(workspace_id=ctx.workspace_id, code__in=role_codes, is_superuser=True).exists():
            return

        ok = await Permission.filter(
            code=permission,
            scope=PermissionScope.WORKSPACE,
            permission_roles__role__workspace_id=ctx.workspace_id,
            permission_roles__role__code__in=role_codes,
        ).exists()
        if not ok:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                error="PERMISSION_DENIED",
            )

    return Depends(_dep)
