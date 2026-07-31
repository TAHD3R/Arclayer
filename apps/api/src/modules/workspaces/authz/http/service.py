from __future__ import annotations

from uuid import UUID

from fastapi import Depends

from src.config import get_settings
from src.core.exceptions import Forbidden
from src.core.i18n import t
from src.models.system.rbac import PermissionScope, SystemPermission, SystemRole, SystemRolePermission
from src.models.workspaces.workspace import Workspace
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.command_policy import build_restricted_recovery_command_policy
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.permissions import PermissionConditionSet, deserialize_condition_sets
from src.modules.workspaces.authz.role_management import (
    WorkspaceRoleManagementAvailabilityReader,
    build_workspace_role_management_availability_reader,
    get_fixed_member_permission_codes,
    is_active_workspace_member,
    require_workspace_role_management_decision,
)
from src.modules.workspaces.authz.schema import AuthzSnapshot
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.modules.workspaces.permissions import PermissionContext, PermissionSubjectKind, PolicyEvaluationService
from src.modules.workspaces.rbac.service import build_workspace_rbac_service


async def _list_user_role_codes_in_workspace(*, user_id: UUID, workspace_id: UUID) -> list[str]:
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
    return [r.code for r in roles if r and r.code]


async def _build_workspace_authz_snapshot(
    *,
    user_id: UUID,
    workspace_id: UUID,
    role_management_reader: WorkspaceRoleManagementAvailabilityReader,
) -> AuthzSnapshot:
    if await Workspace.filter(id=workspace_id, owner_user_id=user_id).exists():
        permissions = await SystemPermission.filter(scope=PermissionScope.WORKSPACE).distinct().order_by("code").all()
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

    role_codes = await _list_user_role_codes_in_workspace(user_id=user_id, workspace_id=workspace_id)
    if not role_codes:
        return AuthzSnapshot(user_id=user_id, role_codes=[], permission_codes=[], is_superuser=False)

    is_superuser = await SystemRole.filter(
        workspace_id=workspace_id,
        code__in=role_codes,
        is_superuser=True,
        ended_at=None,
    ).exists()
    if is_superuser:
        perms = await SystemPermission.filter(scope=PermissionScope.WORKSPACE).distinct().order_by("code").all()
    else:
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
    permission_conditions: dict[str, list[PermissionConditionSet]] = {}
    if not is_superuser and permission_codes:
        rows = await SystemRolePermission.filter(
            role__workspace_id=workspace_id,
            role__code__in=role_codes,
            role__ended_at=None,
            permission__scope=PermissionScope.WORKSPACE,
        ).values("permission__code", "conditions")
        for row in rows:
            permission_code = str(row.get("permission__code") or "").strip()
            if not permission_code:
                continue
            condition_sets = deserialize_condition_sets(row.get("conditions"))
            if not condition_sets:
                continue
            permission_conditions.setdefault(permission_code, []).extend(condition_sets)
    return AuthzSnapshot(
        user_id=user_id,
        role_codes=role_codes,
        permission_codes=permission_codes,
        permission_conditions=permission_conditions,
        is_superuser=is_superuser,
    )


async def ensure_workspace_permission_granted(
    permission: str,
    *,
    user_id: UUID,
    ctx: WorkspaceContext,
    error_code: str = "PERMISSION_DENIED",
    resource_attributes: dict[str, str | int | bool | None] | None = None,
    permission_conditions: dict[str, list[PermissionConditionSet]] | None = None,
    action_conditions: dict[str, list[PermissionConditionSet]] | None = None,
) -> None:
    await build_workspace_rbac_service(get_settings()).ensure_workspace_rbac_ready(workspace_id=ctx.workspace_id)

    snapshot = await _build_workspace_authz_snapshot(
        user_id=user_id,
        workspace_id=ctx.workspace_id,
        role_management_reader=build_workspace_role_management_availability_reader(),
    )
    if not snapshot.is_workspace_owner and not snapshot.permission_codes:
        raise Forbidden(
            message=t("errors", "PERMISSION_DENIED"),
            error=error_code,
        )

    decision = PolicyEvaluationService().evaluate(
        context=PermissionContext(
            action=permission,
            subject_kind=PermissionSubjectKind.WORKSPACE_MEMBER,
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            role_codes=snapshot.role_codes,
            permission_codes=snapshot.permission_codes,
            permission_conditions=permission_conditions or snapshot.permission_conditions,
            action_conditions=action_conditions or {},
            resource_attributes=resource_attributes or {},
            is_superuser=snapshot.is_workspace_owner or snapshot.is_superuser,
        )
    )
    if not decision.allowed:
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


def require_workspace_commercial_effect(effect: RestrictedRecoveryEffect):
    async def _dep(
        ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    ) -> None:
        await build_restricted_recovery_command_policy().authorize(
            workspace_id=ctx.workspace_id,
            effects={effect},
        )

    return Depends(_dep)
