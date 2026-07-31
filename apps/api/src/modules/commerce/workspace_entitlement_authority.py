from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.models.commerce.billing import CommercePlanRevision, WorkspaceCreditAccount, WorkspaceSubscription
from src.modules.commerce.entitlement_schema import EntitlementDecision


class WorkspaceBillingInitializer(Protocol):
    async def ensure_workspace_billing(
        self,
        *,
        workspace_id: UUID,
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlanRevision]: ...


class WorkspaceEntitlementChecker(Protocol):
    async def require(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
    ) -> EntitlementDecision: ...


class WorkspaceEntitlementAuthority:
    """Require initialized commercial state before checking workspace access."""

    __slots__ = ("_billing", "_entitlements")

    def __init__(
        self,
        *,
        billing: WorkspaceBillingInitializer,
        entitlements: WorkspaceEntitlementChecker,
    ) -> None:
        self._billing = billing
        self._entitlements = entitlements

    async def require(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
    ) -> EntitlementDecision:
        await self._billing.ensure_workspace_billing(workspace_id=workspace_id)
        return await self._entitlements.require(
            workspace_id=workspace_id,
            entitlement=entitlement,
        )
