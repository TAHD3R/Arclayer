from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.models.commerce.billing import CommercePlan, WorkspaceCreditAccount, WorkspaceSubscription
from src.modules.commerce.entitlement_schema import EntitlementDecision


class WorkspaceBillingInitializer(Protocol):
    async def ensure_workspace_billing(
        self,
        *,
        workspace_id: UUID,
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlan]: ...


class WorkspaceEntitlementChecker(Protocol):
    async def require(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
    ) -> EntitlementDecision: ...


class WorkspaceEntitlementAuthority:
    """Materialize the configured default subscription before checking workspace access."""

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
