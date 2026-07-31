from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.rbac import ROLE_VIEWER
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.commerce.billing import (
    CommerceEntitlementDefinition,
    CommercePlanRevisionEntitlement,
    CommercialAccessState,
    WorkspaceCommercialAccess,
    WorkspaceSubscription,
)
from src.models.system.rbac import SystemRole
from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipRole
from src.models.workspaces.workspace_invite import WorkspaceEmailInvite, WorkspaceInviteLink
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES

WORKSPACE_ROLE_MANAGEMENT_ENTITLEMENT = "workspace.roles.manage"
FIXED_MEMBER_ACCESS_PROFILE_ID = "fixed-member-access-v1"
FIXED_MEMBER_PERMISSION_CODES = frozenset(
    template.code
    for template in CORE_PERMISSION_TEMPLATES
    if ROLE_VIEWER in {str(role).strip() for role in template.default_roles}
)

RoleManagementUnavailableReason = Literal[
    "subscription_missing",
    "entitlement_missing",
    "entitlement_inactive",
    "revision_entitlement_missing",
    "entitlement_excluded",
    "commercial_access_missing",
    "commercial_access_invalid",
]


@dataclass(frozen=True)
class WorkspaceRoleManagementAvailability:
    workspace_id: UUID
    plan_revision_id: UUID | None
    commercial_access_state: CommercialAccessState | None
    included: bool
    reason: RoleManagementUnavailableReason | None = None


class WorkspaceRoleManagementAvailabilityReader(Protocol):
    async def get_availability(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceRoleManagementAvailability: ...


class WorkspaceCommercialAccessReader(Protocol):
    async def get_state(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercialAccessState | None: ...


class TortoiseWorkspaceCommercialAccessReader:
    async def get_state(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercialAccessState | None:
        query = WorkspaceCommercialAccess.filter(workspace_id=workspace_id)
        if conn is not None:
            query = query.using_db(conn)
        access = await query.first()
        if access is None:
            return None
        try:
            return CommercialAccessState(access.state)
        except ValueError:
            return None


class TortoiseWorkspaceRoleManagementAvailabilityReader:
    """Reads the exact role-management decision from the bound Plan Revision."""

    def __init__(self, commercial_access_reader: WorkspaceCommercialAccessReader) -> None:
        self._commercial_access_reader = commercial_access_reader

    async def get_availability(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceRoleManagementAvailability:
        commercial_access_state = await self._commercial_access_reader.get_state(
            workspace_id=workspace_id,
            conn=conn,
        )
        subscription_query = WorkspaceSubscription.filter(workspace_id=workspace_id)
        if conn is not None:
            subscription_query = subscription_query.using_db(conn)
        subscription = await subscription_query.first()
        if subscription is None:
            return WorkspaceRoleManagementAvailability(
                workspace_id=workspace_id,
                plan_revision_id=None,
                commercial_access_state=commercial_access_state,
                included=False,
                reason="subscription_missing",
            )

        plan_revision_id = UUID(str(subscription.plan_revision_id))
        entitlement_query = CommerceEntitlementDefinition.filter(key=WORKSPACE_ROLE_MANAGEMENT_ENTITLEMENT)
        if conn is not None:
            entitlement_query = entitlement_query.using_db(conn)
        entitlement = await entitlement_query.first()
        if entitlement is None:
            return WorkspaceRoleManagementAvailability(
                workspace_id=workspace_id,
                plan_revision_id=plan_revision_id,
                commercial_access_state=commercial_access_state,
                included=False,
                reason="entitlement_missing",
            )
        if not entitlement.is_active:
            return WorkspaceRoleManagementAvailability(
                workspace_id=workspace_id,
                plan_revision_id=plan_revision_id,
                commercial_access_state=commercial_access_state,
                included=False,
                reason="entitlement_inactive",
            )

        revision_entitlement_query = CommercePlanRevisionEntitlement.filter(
            plan_revision_id=plan_revision_id,
            entitlement_id=entitlement.id,
        )
        if conn is not None:
            revision_entitlement_query = revision_entitlement_query.using_db(conn)
        revision_entitlement = await revision_entitlement_query.first()
        if revision_entitlement is None:
            return WorkspaceRoleManagementAvailability(
                workspace_id=workspace_id,
                plan_revision_id=plan_revision_id,
                commercial_access_state=commercial_access_state,
                included=False,
                reason="revision_entitlement_missing",
            )
        if not revision_entitlement.is_included:
            return WorkspaceRoleManagementAvailability(
                workspace_id=workspace_id,
                plan_revision_id=plan_revision_id,
                commercial_access_state=commercial_access_state,
                included=False,
                reason="entitlement_excluded",
            )
        return WorkspaceRoleManagementAvailability(
            workspace_id=workspace_id,
            plan_revision_id=plan_revision_id,
            commercial_access_state=commercial_access_state,
            included=True,
        )


async def require_workspace_role_management(
    *,
    workspace_id: UUID,
    reader: WorkspaceRoleManagementAvailabilityReader,
    conn: BaseDBAsyncClient | None = None,
) -> WorkspaceRoleManagementAvailability:
    availability = await require_workspace_role_management_decision(
        workspace_id=workspace_id,
        reader=reader,
        conn=conn,
    )
    if availability.included:
        if availability.commercial_access_state == CommercialAccessState.PAYMENT_RESTRICTED:
            raise Conflict(
                message=t("errors", "WORKSPACE_PAYMENT_RESTRICTED"),
                error="WORKSPACE_PAYMENT_RESTRICTED",
                meta={"workspace_id": str(workspace_id)},
            )
        if availability.commercial_access_state is None:
            raise Conflict(
                message=t("errors", "WORKSPACE_COMMERCIAL_UNINITIALIZED"),
                error="WORKSPACE_COMMERCIAL_UNINITIALIZED",
                meta={"workspace_id": str(workspace_id), "reason": "commercial_access_missing"},
            )
        return availability
    meta = {
        "workspace_id": str(workspace_id),
        "plan_revision_id": str(availability.plan_revision_id) if availability.plan_revision_id else None,
        "entitlement": WORKSPACE_ROLE_MANAGEMENT_ENTITLEMENT,
        "reason": availability.reason,
    }
    if availability.reason == "entitlement_excluded":
        raise Conflict(
            message=t("errors", "WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED"),
            error="WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED",
            meta=meta,
        )
    raise Conflict(
        message=t("errors", "WORKSPACE_COMMERCIAL_UNINITIALIZED"),
        error="WORKSPACE_COMMERCIAL_UNINITIALIZED",
        meta=meta,
    )


async def require_workspace_role_management_decision(
    *,
    workspace_id: UUID,
    reader: WorkspaceRoleManagementAvailabilityReader,
    conn: BaseDBAsyncClient | None = None,
) -> WorkspaceRoleManagementAvailability:
    availability = await reader.get_availability(workspace_id=workspace_id, conn=conn)
    if availability.commercial_access_state is None:
        raise Conflict(
            message=t("errors", "WORKSPACE_COMMERCIAL_UNINITIALIZED"),
            error="WORKSPACE_COMMERCIAL_UNINITIALIZED",
            meta={
                "workspace_id": str(workspace_id),
                "plan_revision_id": str(availability.plan_revision_id) if availability.plan_revision_id else None,
                "entitlement": WORKSPACE_ROLE_MANAGEMENT_ENTITLEMENT,
                "reason": availability.reason or "commercial_access_missing",
            },
        )
    if availability.included or availability.reason == "entitlement_excluded":
        return availability
    raise Conflict(
        message=t("errors", "WORKSPACE_COMMERCIAL_UNINITIALIZED"),
        error="WORKSPACE_COMMERCIAL_UNINITIALIZED",
        meta={
            "workspace_id": str(workspace_id),
            "plan_revision_id": str(availability.plan_revision_id) if availability.plan_revision_id else None,
            "entitlement": WORKSPACE_ROLE_MANAGEMENT_ENTITLEMENT,
            "reason": availability.reason,
        },
    )


def build_workspace_role_management_availability_reader() -> WorkspaceRoleManagementAvailabilityReader:
    return TortoiseWorkspaceRoleManagementAvailabilityReader(TortoiseWorkspaceCommercialAccessReader())


async def get_fixed_member_permission_codes(*, workspace_id: UUID) -> list[str]:
    """Return the server-owned Fixed Member profile, independent of Workspace roles."""

    _ = workspace_id
    return sorted(FIXED_MEMBER_PERMISSION_CODES)


async def is_active_workspace_member(*, user_id: UUID, workspace_id: UUID) -> bool:
    return await WorkspaceMembership.filter(
        workspace_id=workspace_id,
        user_id=user_id,
        status="active",
    ).exists()


class WorkspaceRoleAccessConvergenceParticipant:
    """Workspace side of Commerce's transaction-bound access convergence."""

    async def apply_role_management_removal(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        effective_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        await (
            WorkspaceMembershipRole
            .filter(
                membership__workspace_id=workspace_id,
                membership__user_id__not=owner_user_id,
                ended_at=None,
            )
            .using_db(conn)
            .update(ended_at=effective_at)
        )
        await (
            SystemRole
            .filter(
                workspace_id=workspace_id,
                is_system=False,
                ended_at=None,
            )
            .using_db(conn)
            .update(ended_at=effective_at)
        )
        await (
            WorkspaceEmailInvite
            .filter(
                workspace_id=workspace_id,
                role_code__not_isnull=True,
                accepted_at=None,
                revoked_at=None,
            )
            .using_db(conn)
            .update(revoked_at=effective_at)
        )
        await (
            WorkspaceInviteLink
            .filter(
                workspace_id=workspace_id,
                role_code__not_isnull=True,
                disabled_at=None,
            )
            .using_db(conn)
            .update(disabled_at=effective_at)
        )
