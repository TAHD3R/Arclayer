"""Tortoise persistence for Provider-scheduled, convergence-bound transitions."""

from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict
from src.models.commerce.billing import (
    BillingProviderMode,
    CommercePlanRevisionPrice,
    SubscriptionRevisionTransition,
    SubscriptionRevisionTransitionItem,
    SubscriptionTransitionStatus,
    WorkspaceSubscription,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.convergence.repository import TortoisePlanAccessConvergenceRepository
from src.modules.commerce.subscription_transitions.schema import (
    ProviderRevisionSchedulingFacts,
    RenewalTransitionPreview,
    RenewalTransitionScheduleOut,
    RenewalTransitionScheduleRequest,
    SubscriptionTransitionAuditEvent,
)

type ActivityWriter = Callable[..., Awaitable[object]]


class _TransitionRow(Protocol):
    id: UUID
    source_plan_revision_id: UUID
    target_plan_revision_id: UUID
    preview_token_hash: str
    actor_user_id: UUID | None
    correlation_id: UUID


class _TransitionItemRow(Protocol):
    convergence_id: UUID | None
    requires_convergence: bool
    effective_at: datetime
    provider_schedule_id: str | None


class TortoiseSubscriptionTransitionRepository:
    def __init__(
        self,
        settings: Settings,
        *,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        self._settings = settings
        self._convergence = TortoisePlanAccessConvergenceRepository(settings)
        self._activity_writer = activity_writer

    async def load_renewal_preview_for_update(
        self, *, preview_id: UUID, conn: BaseDBAsyncClient
    ) -> RenewalTransitionPreview:
        convergence = await self._convergence.load_preview_for_update(preview_id=preview_id, conn=conn)
        subscription = await (
            WorkspaceSubscription
            .filter(workspace_id=convergence.snapshot.workspace_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if subscription is None:
            raise Conflict(error="WORKSPACE_SUBSCRIPTION_REQUIRED")
        try:
            provider_mode = BillingProviderMode(subscription.provider_mode)
        except (TypeError, ValueError) as exc:
            raise Conflict(error="SUBSCRIPTION_TRANSITION_PROVIDER_MODE_INVALID") from exc
        price = (
            await CommercePlanRevisionPrice
            .filter(
                plan_revision_id=convergence.snapshot.target_revision.id,
                provider=subscription.billing_provider,
                provider_mode=provider_mode,
                billing_cycle=subscription.billing_cycle,
            )
            .using_db(conn)
            .first()
        )
        provider_scheduling = None
        if price is not None and subscription.external_subscription_id is not None:
            provider_scheduling = ProviderRevisionSchedulingFacts(
                provider=subscription.billing_provider,
                provider_mode=provider_mode.value,
                external_subscription_id=subscription.external_subscription_id,
                external_price_id=price.external_price_id,
                billing_cycle=subscription.billing_cycle.value,
                currency=price.currency,
                amount_micros=price.amount_micros,
                effective_at=convergence.effective_at,
            )
        return RenewalTransitionPreview(
            id=convergence.id,
            workspace_id=convergence.snapshot.workspace_id,
            source_revision=convergence.snapshot.source_revision,
            target_revision=convergence.snapshot.target_revision,
            expected_subscription_revision=convergence.snapshot.subscription_revision,
            effective_at=convergence.effective_at,
            preview_revision=convergence.preview_revision,
            preview_hash=convergence.snapshot_hash,
            provider_price_covered=provider_scheduling is not None,
            provider_scheduling=provider_scheduling,
            incompatible_lifecycle_states=(),
            requires_convergence=convergence.snapshot.requires_convergence,
            convergence_id=convergence.id if convergence.snapshot.requires_convergence else None,
            idempotency_key=convergence.idempotency_key,
            correlation_id=convergence.correlation_id,
        )

    async def mark_provider_scheduled(
        self,
        *,
        preview: RenewalTransitionPreview,
        provider_schedule_id: str,
        request: RenewalTransitionScheduleRequest,
        actor_user_id: UUID,
        audit: SubscriptionTransitionAuditEvent,
        conn: BaseDBAsyncClient,
    ) -> RenewalTransitionScheduleOut:
        subscription = await (
            WorkspaceSubscription.filter(workspace_id=preview.workspace_id).using_db(conn).select_for_update().first()
        )
        if subscription is None or subscription.revision != preview.expected_subscription_revision:
            raise Conflict(error="SUBSCRIPTION_TRANSITION_PREVIEW_STALE")
        transition, created = await SubscriptionRevisionTransition.get_or_create(
            idempotency_key=request.idempotency_key,
            defaults={
                "source_plan_revision_id": preview.source_revision.id,
                "target_plan_revision_id": preview.target_revision.id,
                "actor_user_id": actor_user_id,
                "reason": "workspace_plan_provider_schedule",
                "preview_token_hash": _preview_hash(preview.id),
                "requested_at": datetime.now(UTC),
                "status": SubscriptionTransitionStatus.SCHEDULED,
                "correlation_id": request.correlation_id,
            },
            using_db=conn,
        )
        transition = cast(_TransitionRow, transition)
        if not created and (
            transition.source_plan_revision_id != preview.source_revision.id
            or transition.target_plan_revision_id != preview.target_revision.id
            or transition.preview_token_hash != _preview_hash(preview.id)
            or transition.actor_user_id != actor_user_id
        ):
            raise Conflict(error="SUBSCRIPTION_TRANSITION_IDEMPOTENCY_CONFLICT")
        item, item_created = await SubscriptionRevisionTransitionItem.get_or_create(
            transition_id=transition.id,
            subscription_id=subscription.id,
            defaults={
                "convergence_id": preview.convergence_id,
                "requires_convergence": preview.requires_convergence,
                "effective_at": preview.effective_at,
                "provider_schedule_id": provider_schedule_id,
                "status": SubscriptionTransitionStatus.SCHEDULED,
            },
            using_db=conn,
        )
        item = cast(_TransitionItemRow, item)
        if not item_created and (
            item.provider_schedule_id != provider_schedule_id
            or item.convergence_id != preview.convergence_id
            or item.requires_convergence != preview.requires_convergence
            or item.effective_at != preview.effective_at
        ):
            raise Conflict(error="SUBSCRIPTION_TRANSITION_SCHEDULE_IDENTITY_CONFLICT")
        if item_created:
            await self._write_audit(
                audit=audit,
                transition_id=transition.id,
                provider_schedule_id=provider_schedule_id,
                conn=conn,
            )
        return RenewalTransitionScheduleOut(
            transition_id=transition.id,
            provider_schedule_id=item.provider_schedule_id,
            effective_at=item.effective_at,
            correlation_id=transition.correlation_id,
            convergence_id=item.convergence_id,
        )

    async def _write_audit(
        self,
        *,
        audit: SubscriptionTransitionAuditEvent,
        transition_id: UUID,
        provider_schedule_id: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_writer(
            settings=self._settings,
            payload=ActivityAuditPayload(
                event_name=audit.event_name,
                workspace_id=audit.workspace_id,
                actor_user_id=audit.actor_user_id,
                entity_type="subscription_revision_transition",
                entity_id=transition_id,
                properties={
                    "correlation_id": str(audit.correlation_id),
                    "idempotency_key": audit.idempotency_key,
                    "provider_schedule_id": provider_schedule_id,
                },
            ),
            conn=conn,
        )


def _preview_hash(preview_id: UUID) -> str:
    return hashlib.sha256(str(preview_id).encode()).hexdigest()
