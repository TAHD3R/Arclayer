from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import ServiceUnavailable
from src.modules.commerce.convergence.schema import PlanRevisionRef
from src.modules.commerce.subscription_transitions.schema import (
    CommercialCorrectionRequest,
    ProviderRevisionSchedulingFacts,
    RenewalTransitionPreview,
    RenewalTransitionScheduleOut,
    RenewalTransitionScheduleRequest,
)
from src.modules.commerce.subscription_transitions.service import (
    SubscriptionTransitionRepository,
    SubscriptionTransitionService,
)


class _ProviderScheduler:
    def __init__(self) -> None:
        self.scheduled = False

    async def schedule_renewal(self, *, preview, idempotency_key):  # type: ignore[no-untyped-def]
        assert preview.source_revision.id != preview.target_revision.id
        assert idempotency_key == "renewal-schedule"
        self.scheduled = True
        return "provider-schedule-1"


class _UnavailableProviderScheduler:
    def __init__(self) -> None:
        self.called = False

    async def schedule_renewal(self, *, preview, idempotency_key):  # type: ignore[no-untyped-def]
        _ = (preview, idempotency_key)
        self.called = True
        raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_SCHEDULING_UNAVAILABLE")


class _Repository:
    def __init__(self, preview: RenewalTransitionPreview) -> None:
        self.preview = preview
        self.scheduled_with: str | None = None
        self.actor_user_id = None

    async def load_renewal_preview_for_update(self, *, preview_id, conn):  # type: ignore[no-untyped-def]
        _ = (preview_id, conn)
        return self.preview

    async def mark_provider_scheduled(self, *, preview, provider_schedule_id, request, actor_user_id, audit, conn):  # type: ignore[no-untyped-def]
        _ = (request, audit, conn)
        self.scheduled_with = provider_schedule_id
        self.actor_user_id = actor_user_id
        return RenewalTransitionScheduleOut(
            transition_id=preview.id,
            provider_schedule_id=provider_schedule_id,
            effective_at=preview.effective_at,
            correlation_id=preview.correlation_id,
        )


def _provider_scheduling(*, effective_at: datetime) -> ProviderRevisionSchedulingFacts:
    return ProviderRevisionSchedulingFacts(
        provider="stripe",
        provider_mode="test",
        external_subscription_id="sub_test",
        external_price_id="price_target",
        billing_cycle="monthly",
        currency="USD",
        amount_micros=10_000_000,
        effective_at=effective_at,
    )


async def test_renewal_is_only_locally_marked_scheduled_after_provider_schedule() -> None:
    source = PlanRevisionRef(id=uuid4(), plan_id=uuid4(), code="premium", is_free=False)
    target = PlanRevisionRef(id=uuid4(), plan_id=uuid4(), code="premium", is_free=False)
    effective_at = datetime.now(UTC) + timedelta(days=3)
    preview = RenewalTransitionPreview(
        id=uuid4(),
        workspace_id=uuid4(),
        source_revision=source,
        target_revision=target,
        expected_subscription_revision=3,
        effective_at=effective_at,
        preview_revision=1,
        preview_hash="renewal-preview",
        provider_price_covered=True,
        provider_scheduling=_provider_scheduling(effective_at=effective_at),
        incompatible_lifecycle_states=(),
        idempotency_key="renewal-preview",
        correlation_id=uuid4(),
    )
    scheduler = _ProviderScheduler()
    repository = _Repository(preview)
    service = SubscriptionTransitionService(
        repository=cast(SubscriptionTransitionRepository, repository), provider_scheduler=scheduler
    )

    actor_user_id = uuid4()
    result = await service.schedule_renewal(
        request=RenewalTransitionScheduleRequest(
            preview_id=preview.id,
            expected_preview_revision=1,
            idempotency_key="renewal-schedule",
            correlation_id=uuid4(),
        ),
        actor_user_id=actor_user_id,
        conn=cast(BaseDBAsyncClient, object()),
    )

    assert scheduler.scheduled is True
    assert repository.scheduled_with == "provider-schedule-1"
    assert repository.actor_user_id == actor_user_id
    assert result.provider_schedule_id == "provider-schedule-1"


async def test_renewal_schedule_rejects_missing_or_mismatched_required_convergence() -> None:
    source = PlanRevisionRef(id=uuid4(), plan_id=uuid4(), code="premium", is_free=False)
    target = PlanRevisionRef(id=uuid4(), plan_id=uuid4(), code="free", is_free=True)
    convergence_id = uuid4()
    effective_at = datetime.now(UTC) + timedelta(days=3)
    preview = RenewalTransitionPreview(
        id=uuid4(),
        workspace_id=uuid4(),
        source_revision=source,
        target_revision=target,
        expected_subscription_revision=3,
        effective_at=effective_at,
        preview_revision=1,
        preview_hash="renewal-preview",
        provider_price_covered=True,
        provider_scheduling=_provider_scheduling(effective_at=effective_at),
        incompatible_lifecycle_states=(),
        requires_convergence=True,
        convergence_id=convergence_id,
        idempotency_key="renewal-preview",
        correlation_id=uuid4(),
    )
    service = SubscriptionTransitionService(
        repository=cast(SubscriptionTransitionRepository, _Repository(preview)),
        provider_scheduler=_ProviderScheduler(),
    )

    with pytest.raises(Exception, match="SUBSCRIPTION_TRANSITION_CONVERGENCE_REQUIRED"):
        await service.schedule_renewal(
            request=RenewalTransitionScheduleRequest(
                preview_id=preview.id,
                expected_preview_revision=1,
                idempotency_key="renewal-schedule",
                correlation_id=uuid4(),
            ),
            actor_user_id=uuid4(),
            conn=cast(BaseDBAsyncClient, object()),
        )


async def test_renewal_schedule_does_not_persist_when_connector_lacks_scheduling_capability() -> None:
    source = PlanRevisionRef(id=uuid4(), plan_id=uuid4(), code="premium", is_free=False)
    target = PlanRevisionRef(id=uuid4(), plan_id=uuid4(), code="premium", is_free=False)
    effective_at = datetime.now(UTC) + timedelta(days=3)
    preview = RenewalTransitionPreview(
        id=uuid4(),
        workspace_id=uuid4(),
        source_revision=source,
        target_revision=target,
        expected_subscription_revision=3,
        effective_at=effective_at,
        preview_revision=1,
        preview_hash="renewal-preview",
        provider_price_covered=True,
        provider_scheduling=_provider_scheduling(effective_at=effective_at),
        incompatible_lifecycle_states=(),
        idempotency_key="renewal-preview",
        correlation_id=uuid4(),
    )
    repository = _Repository(preview)
    scheduler = _UnavailableProviderScheduler()
    service = SubscriptionTransitionService(
        repository=cast(SubscriptionTransitionRepository, repository),
        provider_scheduler=scheduler,
    )

    with pytest.raises(ServiceUnavailable, match="SUBSCRIPTION_TRANSITION_PROVIDER_SCHEDULING_UNAVAILABLE"):
        await service.schedule_renewal(
            request=RenewalTransitionScheduleRequest(
                preview_id=preview.id,
                expected_preview_revision=1,
                idempotency_key="renewal-schedule",
                correlation_id=uuid4(),
            ),
            actor_user_id=uuid4(),
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert scheduler.called is True
    assert repository.scheduled_with is None


def test_commercial_correction_requires_reason_and_source_evidence() -> None:
    with pytest.raises(ValueError):
        CommercialCorrectionRequest(
            workspace_id=uuid4(),
            source_revision_id=uuid4(),
            target_revision_id=uuid4(),
            reason="",
            source_evidence=(),
            idempotency_key="correction",
            correlation_id=uuid4(),
        )
