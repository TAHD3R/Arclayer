from __future__ import annotations

from typing import Annotated, Protocol
from uuid import UUID

from fastapi import Depends
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.rbac import WORKSPACE_COMMERCE_MANAGE, WORKSPACE_FEATURE_SEATS_MANAGE
from src.config import Settings, get_settings
from src.core.exceptions import Forbidden
from src.core.i18n import t
from src.models.system.rbac import PermissionScope, SystemRolePermission
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.entitlement_repository import EntitlementRepository
from src.modules.commerce.entitlement_schema import WORKSPACE_ROLES_MANAGE_ENTITLEMENT, EntitlementDecision
from src.modules.commerce.entitlement_service import EntitlementService
from src.modules.permissions import (
    PermissionConditionEvaluationContext,
    deserialize_condition_sets,
    evaluate_condition_sets,
)
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import get_workspace_context

WORKSPACE_COMMERCE_MANAGE_REQUIRED = "WORKSPACE_COMMERCE_MANAGE_REQUIRED"
WORKSPACE_FEATURE_SEATS_MANAGE_REQUIRED = "WORKSPACE_FEATURE_SEATS_MANAGE_REQUIRED"


class WorkspaceEntitlementAvailability(Protocol):
    async def check(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> EntitlementDecision: ...


def build_workspace_entitlement_availability(
    settings: Annotated[Settings, Depends(get_settings)],
) -> WorkspaceEntitlementAvailability:
    return EntitlementService(settings, repository=EntitlementRepository())


async def get_workspace_roles_manage_availability(
    *,
    workspace_id: UUID,
    entitlements: WorkspaceEntitlementAvailability,
    conn: BaseDBAsyncClient | None = None,
) -> EntitlementDecision:
    """Read the revision-bound availability for Fixed Member Access governance."""

    return await entitlements.check(
        workspace_id=workspace_id,
        entitlement=WORKSPACE_ROLES_MANAGE_ENTITLEMENT,
        conn=conn,
    )


async def _has_exact_workspace_permission(
    *,
    permission: str,
    user_id: UUID,
    ctx: WorkspaceContext,
) -> bool:
    if ctx.workspace_membership_id is None:
        return False
    grants = await SystemRolePermission.filter(
        permission__code=permission,
        permission__scope=PermissionScope.WORKSPACE,
        role__workspace_id=ctx.workspace_id,
        role__workspace_membership_roles__membership_id=ctx.workspace_membership_id,
        role__workspace_membership_roles__membership__user_id=user_id,
        role__workspace_membership_roles__membership__status="active",
        role__workspace_membership_roles__ended_at__isnull=True,
    ).values("conditions")
    condition_context = PermissionConditionEvaluationContext(
        user_id=user_id,
        workspace_id=ctx.workspace_id,
        resource_attributes={"workspace_id": ctx.workspace_id},
    )
    return any(
        evaluate_condition_sets(deserialize_condition_sets(grant.get("conditions")), context=condition_context)
        for grant in grants
    )


async def _require_workspace_owner_or_permission(
    *,
    permission: str,
    user_id: UUID,
    ctx: WorkspaceContext,
    error_code: str,
    entitlements: WorkspaceEntitlementAvailability,
) -> WorkspaceContext:
    if ctx.is_workspace_owner:
        return ctx
    roles_manage = await get_workspace_roles_manage_availability(
        workspace_id=ctx.workspace_id,
        entitlements=entitlements,
    )
    if not roles_manage.granted:
        raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error=error_code)
    if not await _has_exact_workspace_permission(permission=permission, user_id=user_id, ctx=ctx):
        raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error=error_code)
    return ctx


async def require_workspace_commerce_manage_access(
    user_id: UUID = Depends(get_current_user_id),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    entitlements: WorkspaceEntitlementAvailability = Depends(build_workspace_entitlement_availability),
) -> WorkspaceContext:
    return await _require_workspace_owner_or_permission(
        permission=WORKSPACE_COMMERCE_MANAGE,
        user_id=user_id,
        ctx=ctx,
        error_code=WORKSPACE_COMMERCE_MANAGE_REQUIRED,
        entitlements=entitlements,
    )


async def require_workspace_feature_seats_manage_access(
    user_id: UUID = Depends(get_current_user_id),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    entitlements: WorkspaceEntitlementAvailability = Depends(build_workspace_entitlement_availability),
) -> WorkspaceContext:
    return await _require_workspace_owner_or_permission(
        permission=WORKSPACE_FEATURE_SEATS_MANAGE,
        user_id=user_id,
        ctx=ctx,
        error_code=WORKSPACE_FEATURE_SEATS_MANAGE_REQUIRED,
        entitlements=entitlements,
    )
