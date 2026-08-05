from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest


def _recovery_source(*, kind):
    from src.modules.commerce.access_state.schema import VerifiedProviderDunningFact

    return VerifiedProviderDunningFact(
        workspace_id=uuid4(),
        subscription_revision_id=uuid4(),
        provider="stripe",
        provider_mode="test",
        provider_account_id="platform",
        provider_event_id=f"invoice-{kind.value}",
        provider_period_id="period-3",
        provider_period_start=datetime(2026, 7, 1, tzinfo=UTC),
        provider_period_end=datetime(2026, 8, 1, tzinfo=UTC),
        kind=kind,
        occurred_at=datetime(2026, 7, 31, tzinfo=UTC),
        recovery_deadline=(
            datetime(2026, 7, 31, tzinfo=UTC) + timedelta(days=5) if kind.value == "payment_failure" else None
        ),
        source_payload_sha256="b" * 64,
        signature_reference="sig-3",
    )


def _projection(*, source, state, access_revision: int = 8, provider_period_id: str | None = None):
    from src.modules.commerce.access_state.schema import CommercialAccessProjection, CommercialAccessState

    return CommercialAccessProjection(
        workspace_id=source.workspace_id,
        subscription_revision_id=source.subscription_revision_id,
        provider=source.provider,
        provider_mode=source.provider_mode,
        provider_period_id=provider_period_id or source.provider_period_id,
        provider_period_start=source.provider_period_start,
        provider_period_end=source.provider_period_end,
        state=state,
        recovery_deadline=(datetime(2026, 8, 5, tzinfo=UTC) if state == CommercialAccessState.PAYMENT_GRACE else None),
        access_revision=access_revision,
        source_event_id=source.provider_event_id,
        effective_at=datetime(2026, 7, 31, tzinfo=UTC),
    )


class _GrantPersistence:
    def __init__(self, *, projection, decision=None) -> None:
        self.projection = projection
        self.decision = decision
        self.writes = 0

    async def get_projection(self, *, workspace_id):
        return self.projection

    async def get_decision(self, *, workspace_id, provider: str, provider_period_id: str, subscription_revision_id):
        return self.decision

    async def compare_and_decide(self, *, command):
        self.writes += 1
        self.decision = command.decision
        return command.decision


@pytest.mark.asyncio
async def test_verified_payment_recovery_decides_period_grant_once() -> None:
    from src.modules.commerce.access_state.recovery import PaymentRecoveryGrantService
    from src.modules.commerce.access_state.schema import (
        CommercialAccessState,
        PaymentRecoveryGrantRequest,
        ProviderDunningFactKind,
    )

    source = _recovery_source(kind=ProviderDunningFactKind.PAYMENT_RECOVERED)
    persistence = _GrantPersistence(
        projection=_projection(source=source, state=CommercialAccessState.NORMAL),
    )
    service = PaymentRecoveryGrantService(persistence=persistence)
    request = PaymentRecoveryGrantRequest(
        source=source,
        expected_access_revision=8,
        idempotency_key="recovery:stripe:period-3",
    )

    first = await service.decide(request=request)
    retry = await service.decide(request=request)

    assert first.grant_required is True
    assert retry == first
    assert persistence.writes == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("source_kind", "projection_state", "projection_update", "expected_revision", "error"),
    [
        ("payment_failure", "normal", {}, 8, "COMMERCIAL_RECOVERY_GRANT_SOURCE_INVALID"),
        ("payment_recovered", "payment_grace", {}, 8, "COMMERCIAL_RECOVERY_ACCESS_NOT_RESTORED"),
        (
            "payment_recovered",
            "normal",
            {"provider_period_id": "period-other"},
            8,
            "COMMERCIAL_RECOVERY_PERIOD_CHANGED",
        ),
        ("payment_recovered", "normal", {}, 7, "COMMERCIAL_ACCESS_STATE_REVISION_STALE"),
        (
            "payment_recovered",
            "normal",
            {"subscription_revision_id": uuid4()},
            8,
            "COMMERCIAL_ACCESS_SUBSCRIPTION_REVISION_CHANGED",
        ),
    ],
)
async def test_recovery_grant_rejects_non_restored_or_drifted_period(
    source_kind: str,
    projection_state: str,
    projection_update,
    expected_revision: int,
    error: str,
) -> None:
    from src.core.exceptions import APIError
    from src.modules.commerce.access_state.recovery import PaymentRecoveryGrantService
    from src.modules.commerce.access_state.schema import (
        CommercialAccessState,
        PaymentRecoveryGrantRequest,
        ProviderDunningFactKind,
    )

    source = _recovery_source(kind=ProviderDunningFactKind(source_kind))
    projection = _projection(source=source, state=CommercialAccessState(projection_state))
    projection = projection.model_copy(update=projection_update)
    with pytest.raises(APIError) as exc:
        await PaymentRecoveryGrantService(
            persistence=_GrantPersistence(projection=projection),
        ).decide(
            request=PaymentRecoveryGrantRequest(
                source=source,
                expected_access_revision=expected_revision,
                idempotency_key="recovery:stripe:validation",
            )
        )

    assert exc.value.error == error


@pytest.mark.asyncio
async def test_recovery_grant_requires_an_access_projection() -> None:
    from src.core.exceptions import ServiceUnavailable
    from src.modules.commerce.access_state.recovery import PaymentRecoveryGrantService
    from src.modules.commerce.access_state.schema import PaymentRecoveryGrantRequest, ProviderDunningFactKind

    source = _recovery_source(kind=ProviderDunningFactKind.PAYMENT_RECOVERED)
    with pytest.raises(ServiceUnavailable, match="COMMERCIAL_ACCESS_STATE_UNAVAILABLE"):
        await PaymentRecoveryGrantService(
            persistence=_GrantPersistence(projection=None),
        ).decide(
            request=PaymentRecoveryGrantRequest(
                source=source,
                expected_access_revision=8,
                idempotency_key="recovery:stripe:missing-state",
            )
        )
