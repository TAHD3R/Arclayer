"""Internal resolver used only after billing webhook signature verification."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.commerce.billing import SubscriptionRevisionTransitionItem, SubscriptionTransitionStatus
from src.modules.commerce.convergence.schema import ProviderConfirmedConvergenceApplication
from src.modules.commerce.subscription_transitions.schema import ProviderConfirmedTransitionEvidence


class _SubscriptionRow(Protocol):
    workspace_id: UUID


class _TransitionRow(Protocol):
    target_plan_revision_id: UUID


class _TransitionItemRow(Protocol):
    requires_convergence: bool
    convergence_id: UUID | None
    status: SubscriptionTransitionStatus
    effective_at: datetime
    subscription: _SubscriptionRow
    transition: _TransitionRow

    async def fetch_related(self, *relations: str, using_db: BaseDBAsyncClient) -> None: ...


class TortoiseProviderConfirmedConvergenceResolver:
    """Resolve the exact Provider schedule identity to its reviewed convergence."""

    async def resolve(
        self,
        *,
        workspace_id: UUID,
        evidence: ProviderConfirmedTransitionEvidence,
        provider_event_id: str,
        correlation_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ProviderConfirmedConvergenceApplication:
        item = cast(
            _TransitionItemRow | None,
            await SubscriptionRevisionTransitionItem
            .filter(provider_schedule_id=evidence.provider_schedule_id)
            .using_db(conn)
            .select_for_update()
            .first(),
        )
        if (
            item is None
            or not item.requires_convergence
            or item.convergence_id is None
            or item.status != SubscriptionTransitionStatus.SCHEDULED
            or item.effective_at != evidence.effective_at
        ):
            raise Conflict(error="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED")
        await item.fetch_related("subscription", "transition", using_db=conn)
        if (
            item.subscription.workspace_id != workspace_id
            or item.transition.target_plan_revision_id != evidence.target_revision_id
        ):
            raise Conflict(error="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED")
        return ProviderConfirmedConvergenceApplication(
            preview_id=UUID(str(item.convergence_id)),
            workspace_id=workspace_id,
            target_revision_id=evidence.target_revision_id,
            effective_at=evidence.effective_at,
            provider_event_id=provider_event_id,
            idempotency_key=f"provider-schedule:{evidence.provider_schedule_id}:{provider_event_id}",
            correlation_id=correlation_id,
        )
