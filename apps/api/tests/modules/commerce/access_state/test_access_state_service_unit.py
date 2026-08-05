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
        provider_mode="test",
        provider_period_id=provider_period_id,
        provider_period_start=now - timedelta(days=30),
        provider_period_end=now,
        state=CommercialAccessState.NORMAL,
        recovery_deadline=None,
        access_revision=access_revision,
        source_event_id="invoice-paid-1",
        source_occurred_at=now - timedelta(days=1),
        dunning_policy_revision=1,
        effective_at=now - timedelta(days=1),
    )


def _provider_fact(*, projection, kind, provider_period_id: str = "period-2"):
    from src.modules.commerce.access_state.schema import ProviderDunningFact

    now = datetime(2026, 7, 31, tzinfo=UTC)
    same_period = provider_period_id == projection.provider_period_id
    return ProviderDunningFact(
        workspace_id=projection.workspace_id,
        subscription_revision_id=projection.subscription_revision_id,
        provider=projection.provider,
        provider_mode=projection.provider_mode,
        provider_account_id="platform",
        provider_event_id=f"invoice-{kind.value}-2",
        provider_period_id=provider_period_id,
        provider_period_start=(projection.provider_period_start if same_period else now),
        provider_period_end=(projection.provider_period_end if same_period else now + timedelta(days=30)),
        kind=kind,
        occurred_at=now,
        recovery_deadline=now + timedelta(days=5) if kind.value == "payment_failure" else None,
        source_payload_sha256="a" * 64,
    )


def _policy(*, projection):
    from src.modules.commerce.access_state.schema import ResolvedDunningPolicy

    return ResolvedDunningPolicy(
        policy_id=uuid4(),
        provider=projection.provider,
        provider_mode=projection.provider_mode,
        revision=2,
    )


class _Verifier:
    async def verify(self, *, source):
        from src.modules.commerce.access_state.schema import VerifiedProviderDunningFact

        return VerifiedProviderDunningFact(**source.model_dump(), signature_reference="sig-2")


class _AccessPersistence:
    def __init__(self, *, projection, receipt=None) -> None:
        self.projection = projection
        self.receipts = {}
        self.current_result = receipt
        self.writes = []

    async def get_transition_receipt(
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        provider_event_id: str,
        conn=None,
    ):
        return self.receipts.get((provider, provider_mode, provider_account_id, provider_event_id))

    async def get_projection(self, *, workspace_id, conn=None, for_update: bool = False):
        return self.projection

    async def get_current_result(self, *, workspace_id, conn=None):
        return self.current_result

    async def compare_and_append(self, *, write, conn=None):
        self.writes.append(write)
        self.projection = write.projection
        self.current_result = write.result
        self.receipts[
            (
                write.source.provider,
                write.source.provider_mode,
                write.source.provider_account_id,
                write.source.provider_event_id,
            )
        ] = write.result
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
            policy=_policy(projection=current),
            expected_access_revision=3,
            idempotency_key="provider:stripe:invoice-failed-2",
        )
    )

    assert outcome.result.projection.state == CommercialAccessState.PAYMENT_GRACE
    assert outcome.result.projection.recovery_deadline == source.recovery_deadline
    assert outcome.result.notification.milestone == "payment_grace_started"
    assert outcome.result.hosting_handoff is None
    assert outcome.transitioned is True
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
            policy=_policy(projection=current),
            expected_access_revision=current.access_revision,
            idempotency_key="provider:stripe:invoice-final-unpaid-2",
        )
    )

    assert outcome.result.projection.state == CommercialAccessState.PAYMENT_RESTRICTED
    assert outcome.result.notification.milestone == "payment_restricted"
    assert outcome.result.hosting_handoff is not None
    assert outcome.result.hosting_handoff.state == CommercialAccessState.PAYMENT_RESTRICTED
    assert outcome.result.hosting_handoff.cause == "provider_final_unpaid"


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
            policy=_policy(projection=current),
            expected_access_revision=current.access_revision,
            idempotency_key="provider:stripe:invoice-payment-recovered-2",
        )
    )

    assert outcome.result.projection.state == CommercialAccessState.NORMAL
    assert outcome.result.projection.recovery_deadline is None
    assert outcome.result.notification.milestone == "payment_recovered"
    assert outcome.result.hosting_handoff is not None
    assert outcome.result.hosting_handoff.cause == "provider_payment_recovered"


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
        policy=_policy(projection=current),
        expected_access_revision=current.access_revision,
        idempotency_key="provider:stripe:invoice-payment-failure-2",
    )

    first = await service.apply_provider_fact(request=request)
    retry = await service.apply_provider_fact(request=request)

    assert retry.result == first.result
    assert retry.transitioned is False
    assert len(persistence.writes) == 1


@pytest.mark.asyncio
async def test_provider_receipt_identity_isolated_by_mode_and_account() -> None:
    from src.modules.commerce.access_state.schema import (
        CommercialAccessApplyDisposition,
        ProviderDunningFactKind,
        ProviderDunningTransitionRequest,
    )
    from src.modules.commerce.access_state.service import CommercialAccessStateService

    current = _normal_projection()
    source = _provider_fact(projection=current, kind=ProviderDunningFactKind.PAYMENT_FAILURE)
    persistence = _AccessPersistence(projection=current)
    service = CommercialAccessStateService(persistence=persistence, verifier=_Verifier())
    first = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=source,
            policy=_policy(projection=current),
            expected_access_revision=current.access_revision,
            idempotency_key="provider:stripe:first-account",
        )
    )
    other_account = source.model_copy(update={"provider_account_id": "connected-account"})

    outcome = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=other_account,
            policy=_policy(projection=first.result.projection),
            expected_access_revision=first.result.projection.access_revision,
            idempotency_key="provider:stripe:other-account",
        )
    )

    assert outcome.disposition == CommercialAccessApplyDisposition.STATE_REPEAT_IGNORED
    assert outcome.disposition != CommercialAccessApplyDisposition.REPLAYED


@pytest.mark.asyncio
async def test_same_period_dunning_repeats_stale_facts_and_regressions_do_not_mutate_state() -> None:
    from src.modules.commerce.access_state.schema import (
        CommercialAccessApplyDisposition,
        ProviderDunningFactKind,
        ProviderDunningTransitionRequest,
    )
    from src.modules.commerce.access_state.service import CommercialAccessStateService

    current = _normal_projection()
    policy = _policy(projection=current)
    failure = _provider_fact(
        projection=current,
        kind=ProviderDunningFactKind.PAYMENT_FAILURE,
        provider_period_id="period-dunning",
    )
    persistence = _AccessPersistence(projection=current)
    service = CommercialAccessStateService(
        persistence=persistence,
        verifier=_Verifier(),
        now=lambda: datetime(2026, 7, 31, tzinfo=UTC),
    )
    first = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=failure,
            policy=policy,
            expected_access_revision=current.access_revision,
            idempotency_key="provider:stripe:first-failure",
        )
    )
    assert failure.recovery_deadline is not None
    repeated = failure.model_copy(
        update={
            "provider_event_id": "invoice-payment-failure-repeat",
            "occurred_at": failure.occurred_at + timedelta(seconds=1),
            "recovery_deadline": failure.recovery_deadline + timedelta(days=10),
        }
    )
    repeat = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=repeated,
            policy=policy,
            expected_access_revision=first.result.projection.access_revision,
            idempotency_key="provider:stripe:repeat-failure",
        )
    )
    assert repeat.disposition == CommercialAccessApplyDisposition.STATE_REPEAT_IGNORED
    assert repeat.result == first.result

    final = failure.model_copy(
        update={
            "provider_event_id": "invoice-final-unpaid",
            "kind": ProviderDunningFactKind.FINAL_UNPAID,
            "occurred_at": failure.occurred_at + timedelta(seconds=2),
            "recovery_deadline": None,
        }
    )
    restricted = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=final,
            policy=policy,
            expected_access_revision=first.result.projection.access_revision,
            idempotency_key="provider:stripe:final-unpaid",
        )
    )
    stale = repeated.model_copy(update={"provider_event_id": "invoice-stale-failure"})
    stale_outcome = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=stale,
            policy=policy,
            expected_access_revision=restricted.result.projection.access_revision,
            idempotency_key="provider:stripe:stale-failure",
        )
    )
    regression = repeated.model_copy(
        update={
            "provider_event_id": "invoice-regressing-failure",
            "occurred_at": final.occurred_at + timedelta(seconds=1),
        }
    )
    regression_outcome = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=regression,
            policy=policy,
            expected_access_revision=restricted.result.projection.access_revision,
            idempotency_key="provider:stripe:regressing-failure",
        )
    )

    assert stale_outcome.disposition == CommercialAccessApplyDisposition.STALE_IGNORED
    assert regression_outcome.disposition == CommercialAccessApplyDisposition.STATE_REGRESSION_IGNORED
    assert persistence.projection == restricted.result.projection
    assert len(persistence.writes) == 2


@pytest.mark.asyncio
async def test_recovered_period_cannot_reenter_dunning_from_a_later_failure() -> None:
    from src.modules.commerce.access_state.schema import (
        CommercialAccessApplyDisposition,
        CommercialAccessState,
        ProviderDunningFactKind,
        ProviderDunningTransitionRequest,
    )
    from src.modules.commerce.access_state.service import CommercialAccessStateService

    current = _normal_projection(provider_period_id="period-recovered").model_copy(
        update={
            "source_event_id": "invoice-failed",
            "source_occurred_at": datetime(2026, 7, 30, tzinfo=UTC),
            "state": CommercialAccessState.PAYMENT_GRACE,
            "recovery_deadline": datetime(2026, 8, 5, tzinfo=UTC),
        }
    )
    recovered = _provider_fact(
        projection=current,
        kind=ProviderDunningFactKind.PAYMENT_RECOVERED,
        provider_period_id=current.provider_period_id,
    )
    persistence = _AccessPersistence(projection=current)
    service = CommercialAccessStateService(persistence=persistence, verifier=_Verifier())
    recovered_outcome = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=recovered,
            policy=_policy(projection=current),
            expected_access_revision=current.access_revision,
            idempotency_key="provider:stripe:payment-recovered",
        )
    )
    repeated_recovery = recovered.model_copy(
        update={
            "provider_event_id": "invoice-payment-recovered-repeat",
            "occurred_at": recovered.occurred_at + timedelta(seconds=1),
        }
    )
    repeated_outcome = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=repeated_recovery,
            policy=_policy(projection=recovered_outcome.result.projection),
            expected_access_revision=recovered_outcome.result.projection.access_revision,
            idempotency_key="provider:stripe:payment-recovered-repeat",
        )
    )
    assert repeated_outcome.disposition == CommercialAccessApplyDisposition.STATE_REPEAT_IGNORED
    assert len(persistence.writes) == 1

    source = _provider_fact(
        projection=recovered_outcome.result.projection,
        kind=ProviderDunningFactKind.PAYMENT_FAILURE,
        provider_period_id=current.provider_period_id,
    ).model_copy(
        update={
            "occurred_at": recovered.occurred_at + timedelta(seconds=1),
            "recovery_deadline": recovered.occurred_at + timedelta(days=5),
        }
    )

    outcome = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=source,
            policy=_policy(projection=recovered_outcome.result.projection),
            expected_access_revision=recovered_outcome.result.projection.access_revision,
            idempotency_key="provider:stripe:recovered-period-failure",
        )
    )

    assert outcome.disposition == CommercialAccessApplyDisposition.STATE_REGRESSION_IGNORED
    assert persistence.projection.state == CommercialAccessState.NORMAL
    assert len(persistence.writes) == 1

    older_period = source.model_copy(
        update={
            "provider_event_id": "invoice-older-period-failure",
            "provider_period_id": "period-older",
            "provider_period_start": current.provider_period_start - timedelta(days=30),
            "provider_period_end": current.provider_period_start,
            "occurred_at": source.occurred_at + timedelta(seconds=1),
            "recovery_deadline": source.occurred_at + timedelta(days=5),
        }
    )
    stale = await service.apply_provider_fact(
        request=ProviderDunningTransitionRequest(
            source=older_period,
            policy=_policy(projection=recovered_outcome.result.projection),
            expected_access_revision=recovered_outcome.result.projection.access_revision,
            idempotency_key="provider:stripe:older-period-failure",
        )
    )
    assert stale.disposition == CommercialAccessApplyDisposition.STALE_IGNORED
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
                policy=_policy(projection=canonical),
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
            provider_mode="test",
            provider_account_id="platform",
            provider_event_id="invoice-past-due-without-deadline",
            provider_period_id="period-2",
            provider_period_start=datetime(2026, 7, 31, tzinfo=UTC),
            provider_period_end=datetime(2026, 8, 30, tzinfo=UTC),
            kind=ProviderDunningFactKind.PAYMENT_FAILURE,
            occurred_at=datetime(2026, 7, 31, tzinfo=UTC),
            source_payload_sha256="a" * 64,
        )
