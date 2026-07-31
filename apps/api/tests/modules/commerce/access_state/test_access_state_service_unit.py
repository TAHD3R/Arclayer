from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest


def _normal_projection(*, access_revision: int = 3, provider_period_id: str = "period-1"):
    from src.modules.commerce.access_state.schema import CommercialAccessProjection, CommercialAccessState

    now = datetime(2026, 7, 31, tzinfo=UTC)
    return CommercialAccessProjection(
        workspace_id=uuid4(),
        subscription_revision_id=uuid4(),
        provider="stripe",
        provider_period_id=provider_period_id,
        state=CommercialAccessState.NORMAL,
        recovery_deadline=None,
        access_revision=access_revision,
        source_event_id="invoice-paid-1",
        effective_at=now - timedelta(days=1),
    )


def _provider_fact(*, projection, kind, provider_period_id: str = "period-2"):
    from src.modules.commerce.access_state.schema import ProviderDunningFact

    now = datetime(2026, 7, 31, tzinfo=UTC)
    return ProviderDunningFact(
        workspace_id=projection.workspace_id,
        subscription_revision_id=projection.subscription_revision_id,
        provider=projection.provider,
        provider_event_id=f"invoice-{kind.value}-2",
        provider_period_id=provider_period_id,
        kind=kind,
        occurred_at=now,
        recovery_deadline=now + timedelta(days=5) if kind.value == "payment_failure" else None,
        source_payload_sha256="a" * 64,
    )


class _Verifier:
    async def verify(self, *, source):
        from src.modules.commerce.access_state.schema import VerifiedProviderDunningFact

        return VerifiedProviderDunningFact(**source.model_dump(), signature_reference="sig-2")


class _AccessPersistence:
    def __init__(self, *, projection, receipt=None) -> None:
        self.projection = projection
        self.receipt = receipt
        self.writes = []

    async def get_transition_receipt(self, *, provider: str, provider_event_id: str):
        return self.receipt

    async def get_projection(self, *, workspace_id):
        return self.projection

    async def compare_and_append(self, *, write):
        self.writes.append(write)
        self.projection = write.projection
        self.receipt = write.result
        return write.result


@pytest.mark.asyncio
async def test_signed_payment_failure_enters_provider_deadline_bound_grace_once() -> None:
    from src.modules.commerce.access_state.schema import (
        CommercialAccessState,
        ProviderDunningFactKind,
        ProviderDunningTransitionRequest,
    )
    from src.modules.commerce.access_state.service import CommercialAccessStateService

    now = datetime(2026, 7, 31, tzinfo=UTC)
    current = _normal_projection()
    source = _provider_fact(projection=current, kind=ProviderDunningFactKind.PAYMENT_FAILURE)
    persistence = _AccessPersistence(projection=current)
    service = CommercialAccessStateService(
        persistence=persistence,
        verifier=_Verifier(),
        now=lambda: now,
    )

    outcome = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=source,
            expected_access_revision=3,
            idempotency_key="provider:stripe:invoice-failed-2",
        )
    )

    assert outcome.projection.state == CommercialAccessState.PAYMENT_GRACE
    assert outcome.projection.recovery_deadline == source.recovery_deadline
    assert outcome.notification.milestone == "payment_grace_started"
    assert outcome.hosting_handoff is None
    assert len(persistence.writes) == 1


@pytest.mark.asyncio
async def test_final_unpaid_enters_restricted_and_publishes_hosting_handoff() -> None:
    from src.modules.commerce.access_state.schema import (
        CommercialAccessState,
        ProviderDunningFactKind,
        ProviderDunningTransitionRequest,
    )
    from src.modules.commerce.access_state.service import CommercialAccessStateService

    current = _normal_projection()
    source = _provider_fact(projection=current, kind=ProviderDunningFactKind.FINAL_UNPAID)
    outcome = await CommercialAccessStateService(
        persistence=_AccessPersistence(projection=current),
        verifier=_Verifier(),
        now=lambda: datetime(2026, 7, 31, tzinfo=UTC),
    ).apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=source,
            expected_access_revision=current.access_revision,
            idempotency_key="provider:stripe:invoice-final-unpaid-2",
        )
    )

    assert outcome.projection.state == CommercialAccessState.PAYMENT_RESTRICTED
    assert outcome.notification.milestone == "payment_restricted"
    assert outcome.hosting_handoff is not None
    assert outcome.hosting_handoff.state == CommercialAccessState.PAYMENT_RESTRICTED
    assert outcome.hosting_handoff.cause == "provider_final_unpaid"


@pytest.mark.asyncio
async def test_signed_payment_recovery_restores_normal_access() -> None:
    from src.modules.commerce.access_state.schema import (
        CommercialAccessState,
        ProviderDunningFactKind,
        ProviderDunningTransitionRequest,
    )
    from src.modules.commerce.access_state.service import CommercialAccessStateService

    current = _normal_projection()
    current = current.model_copy(
        update={
            "state": CommercialAccessState.PAYMENT_GRACE,
            "recovery_deadline": datetime(2026, 8, 5, tzinfo=UTC),
        }
    )
    source = _provider_fact(
        projection=current,
        kind=ProviderDunningFactKind.PAYMENT_RECOVERED,
        provider_period_id=current.provider_period_id,
    )
    outcome = await CommercialAccessStateService(
        persistence=_AccessPersistence(projection=current),
        verifier=_Verifier(),
        now=lambda: datetime(2026, 7, 31, tzinfo=UTC),
    ).apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=source,
            expected_access_revision=current.access_revision,
            idempotency_key="provider:stripe:invoice-payment-recovered-2",
        )
    )

    assert outcome.projection.state == CommercialAccessState.NORMAL
    assert outcome.projection.recovery_deadline is None
    assert outcome.notification.milestone == "payment_recovered"
    assert outcome.hosting_handoff is not None
    assert outcome.hosting_handoff.cause == "provider_payment_recovered"


@pytest.mark.asyncio
async def test_duplicate_provider_receipt_returns_original_result_without_new_write() -> None:
    from src.modules.commerce.access_state.schema import ProviderDunningFactKind, ProviderDunningTransitionRequest
    from src.modules.commerce.access_state.service import CommercialAccessStateService

    current = _normal_projection()
    source = _provider_fact(projection=current, kind=ProviderDunningFactKind.PAYMENT_FAILURE)
    persistence = _AccessPersistence(projection=current)
    service = CommercialAccessStateService(
        persistence=persistence,
        verifier=_Verifier(),
        now=lambda: datetime(2026, 7, 31, tzinfo=UTC),
    )
    request = ProviderDunningTransitionRequest(
        source=source,
        expected_access_revision=current.access_revision,
        idempotency_key="provider:stripe:invoice-payment-failure-2",
    )

    first = await service.apply_provider_fact(request=request)
    retry = await service.apply_provider_fact(request=request)

    assert retry == first
    assert len(persistence.writes) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("projection", "source_update", "expected_revision", "error"),
    [
        (None, {}, 3, "COMMERCIAL_ACCESS_STATE_UNAVAILABLE"),
        (_normal_projection(), {}, 2, "COMMERCIAL_ACCESS_STATE_REVISION_STALE"),
        (
            _normal_projection(),
            {"subscription_revision_id": uuid4()},
            3,
            "COMMERCIAL_ACCESS_SUBSCRIPTION_REVISION_CHANGED",
        ),
        (_normal_projection(), {"provider": "paddle"}, 3, "COMMERCIAL_ACCESS_PROVIDER_CHANGED"),
    ],
)
async def test_access_transition_rejects_unavailable_or_drifted_authority(
    projection,
    source_update,
    expected_revision: int,
    error: str,
) -> None:
    from src.core.exceptions import APIError
    from src.modules.commerce.access_state.schema import ProviderDunningFactKind, ProviderDunningTransitionRequest
    from src.modules.commerce.access_state.service import CommercialAccessStateService

    canonical = projection or _normal_projection()
    source = _provider_fact(projection=canonical, kind=ProviderDunningFactKind.PAYMENT_FAILURE)
    source = source.model_copy(update=source_update)
    with pytest.raises(APIError) as exc:
        await CommercialAccessStateService(
            persistence=_AccessPersistence(projection=projection),
            verifier=_Verifier(),
        ).apply_provider_fact(
            request=ProviderDunningTransitionRequest(
                source=source,
                expected_access_revision=expected_revision,
                idempotency_key="provider:stripe:authority-check",
            )
        )

    assert exc.value.error == error


def test_payment_failure_without_provider_deadline_fails_instead_of_inferring_grace() -> None:
    from pydantic import ValidationError

    from src.modules.commerce.access_state.schema import ProviderDunningFact, ProviderDunningFactKind

    with pytest.raises(ValidationError, match="payment failure requires provider recovery deadline"):
        ProviderDunningFact(
            workspace_id=uuid4(),
            subscription_revision_id=uuid4(),
            provider="stripe",
            provider_event_id="invoice-past-due-without-deadline",
            provider_period_id="period-2",
            kind=ProviderDunningFactKind.PAYMENT_FAILURE,
            occurred_at=datetime(2026, 7, 31, tzinfo=UTC),
            source_payload_sha256="a" * 64,
        )
