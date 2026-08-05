from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_composition_applies_only_the_injected_verified_provider_fact() -> None:
    from src.modules.commerce.access_state.composition import CommercialAccessStateComposition
    from src.modules.commerce.access_state.schema import (
        CommercialAccessProjection,
        CommercialAccessState,
        ProviderDunningFact,
        ProviderDunningFactKind,
        ResolvedDunningPolicy,
        VerifiedProviderDunningFact,
    )

    now = datetime(2026, 7, 31, tzinfo=UTC)
    workspace_id = uuid4()
    revision_id = uuid4()
    verified = VerifiedProviderDunningFact(
        workspace_id=workspace_id,
        subscription_revision_id=revision_id,
        provider="stripe",
        provider_mode="test",
        provider_account_id="platform",
        provider_event_id="evt_verified",
        provider_period_id="period_verified",
        provider_period_start=now,
        provider_period_end=now + timedelta(days=30),
        kind=ProviderDunningFactKind.PAYMENT_FAILURE,
        occurred_at=now,
        recovery_deadline=now + timedelta(days=5),
        source_payload_sha256="a" * 64,
        signature_reference="stripe:signature:evt_verified",
    )
    projection = CommercialAccessProjection(
        workspace_id=workspace_id,
        subscription_revision_id=revision_id,
        provider="stripe",
        provider_mode="test",
        provider_period_id="period_previous",
        provider_period_start=now - timedelta(days=30),
        provider_period_end=now,
        state=CommercialAccessState.NORMAL,
        recovery_deadline=None,
        access_revision=1,
        source_event_id="evt_previous",
        effective_at=now,
    )

    class Persistence:
        async def get_transition_receipt(self, **_kwargs):
            return None

        async def get_projection(self, **_kwargs):
            return projection

        async def compare_and_append(self, *, write, **_kwargs):
            return write.result

        async def get_decision(self, **_kwargs):
            return None

        async def compare_and_decide(self, *, command):
            return command.decision

    composition = CommercialAccessStateComposition(
        persistence=Persistence(),
        now=lambda: now,
    )

    result = await composition.apply_verified_provider_fact(
        source=verified,
        policy=ResolvedDunningPolicy(
            policy_id=uuid4(),
            provider="stripe",
            provider_mode="test",
            revision=1,
        ),
        expected_access_revision=1,
        idempotency_key="provider:stripe:evt_verified",
    )

    assert result.projection.state == CommercialAccessState.PAYMENT_GRACE

    raw = ProviderDunningFact(**verified.model_dump(exclude={"signature_reference"}))
    with pytest.raises(TypeError, match="VerifiedProviderDunningFact"):
        await composition.apply_verified_provider_fact(
            source=cast(VerifiedProviderDunningFact, raw),
            policy=ResolvedDunningPolicy(
                policy_id=uuid4(),
                provider="stripe",
                provider_mode="test",
                revision=1,
            ),
            expected_access_revision=1,
            idempotency_key="provider:stripe:evt_raw",
        )
