from __future__ import annotations

from uuid import UUID

from fastapi import Depends

from src.core.exceptions import Forbidden
from src.core.i18n import t
from src.models.system.rbac import Permission, PermissionScope, Role, RolePermission
from src.models.workspaces.workspace import WorkspaceMembershipRole
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access


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
    admin_role = await Role.get_or_none(workspace_id=ctx.workspace_id, code="owner", is_system=True)
    if admin_role is None:
        return
    await WorkspaceMembershipRole.get_or_create(membership_id=ctx.workspace_membership_id, role_id=admin_role.id)


async def ensure_workspace_permission_granted(
    permission: str,
    *,
    user_id: UUID,
    ctx: WorkspaceContext,
    error_code: str = "PERMISSION_DENIED",
) -> None:
    if (
        not await Role.filter(workspace_id=ctx.workspace_id, is_system=True).exists()
        or not await RolePermission.filter(
            role__workspace_id=ctx.workspace_id,
            role__is_system=True,
        ).exists()
    ):
        from src.config import get_settings
        from src.modules.system.rbac.service import RBACService

        await RBACService(get_settings()).ensure_workspace_system_role_grants(workspace_id=ctx.workspace_id)

    await _ensure_creator_admin_has_admin_role(ctx=ctx, user_id=user_id)

    role_codes = await _list_user_role_codes_in_workspace(user_id=user_id, workspace_id=ctx.workspace_id)
    if not role_codes:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED"),
            error=error_code,
        )

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
            message=t("errors", "PERMISSION_DENIED"),
            error=error_code,
        )


def require_workspace_permission(permission: str, *, error_code: str = "PERMISSION_DENIED"):
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
        await ensure_workspace_permission_granted(
            permission,
            user_id=user_id,
            ctx=ctx,
            error_code=error_code,
        )

    return Depends(_dep)
