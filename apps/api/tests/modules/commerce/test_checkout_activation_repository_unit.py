from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from src.core.exceptions import Conflict
from src.models.commerce.billing import BillingCycle, BillingProviderMode
from src.models.commerce.payments import CommerceCheckoutKind, CommerceCheckoutOutcome, CommerceCheckoutStatus
from src.modules.commerce.checkout_activation_repository import (
    CheckoutActivationRequest,
    TortoiseCheckoutActivationRepository,
)


def _request() -> CheckoutActivationRequest:
    return CheckoutActivationRequest(
        workspace_id=uuid4(),
        subscription_id=uuid4(),
        target_plan_revision_id=uuid4(),
        plan_code="premium",
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=10_000_000,
        external_price_id="sim_price_premium",
        checkout_session_id=uuid4(),
        external_session_id="sim_cs_activation",
        checkout_outcome_event_id="sim_evt_checkout_activation",
        lifecycle_occurred_at=datetime.now(UTC),
    )


def _checkout(request: CheckoutActivationRequest) -> SimpleNamespace:
    completed_at = request.lifecycle_occurred_at - timedelta(seconds=1)
    return SimpleNamespace(
        id=request.checkout_session_id,
        workspace_id=request.workspace_id,
        subscription_id=request.subscription_id,
        target_plan_revision_id=request.target_plan_revision_id,
        plan_code=request.plan_code,
        provider=request.provider,
        provider_mode=request.provider_mode,
        provider_account_id=request.provider_account_id,
        kind=CommerceCheckoutKind.SUBSCRIPTION,
        status=CommerceCheckoutStatus.COMPLETED,
        billing_cycle=request.billing_cycle,
        currency=request.currency,
        amount_micros=request.amount_micros,
        external_price_id=request.external_price_id,
        external_session_id=request.external_session_id,
        actor_user_id=uuid4(),
        completed_at=completed_at,
        expires_at=request.lifecycle_occurred_at + timedelta(minutes=10),
        revision=2,
    )


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    (
        ("workspace_id", uuid4()),
        ("subscription_id", uuid4()),
        ("target_plan_revision_id", uuid4()),
        ("plan_code", "other"),
        ("provider", "stripe"),
        ("provider_mode", BillingProviderMode.LIVE),
        ("provider_account_id", "other"),
        ("billing_cycle", BillingCycle.YEARLY),
        ("currency", "EUR"),
        ("amount_micros", 1),
        ("external_price_id", "other-price"),
        ("external_session_id", "other-session"),
        ("status", CommerceCheckoutStatus.FAILED),
    ),
)
def test_checkout_activation_rejects_every_exact_fact_mismatch(field: str, invalid_value: object) -> None:
    request = _request()
    checkout = _checkout(request)
    setattr(checkout, field, invalid_value)

    with pytest.raises(Conflict, match="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED"):
        TortoiseCheckoutActivationRepository._validate_checkout(
            checkout=cast(Any, checkout),
            request=request,
        )


def test_checkout_activation_requires_succeeded_processed_actor_command() -> None:
    request = _request()
    checkout = _checkout(request)
    command = SimpleNamespace(
        checkout_session_id=checkout.id,
        workspace_id=checkout.workspace_id,
        actor_user_id=checkout.actor_user_id,
        outcome=CommerceCheckoutOutcome.SUCCEEDED,
        expected_revision=1,
        result_status=CommerceCheckoutStatus.COMPLETED,
        accepted_inbox_id=uuid4(),
        accepted_job_id=uuid4(),
        accepted_at=checkout.completed_at,
        processed_at=checkout.completed_at,
        result_revision=checkout.revision,
        event_created_at=checkout.completed_at,
    )
    TortoiseCheckoutActivationRepository._validate_command(
        command=cast(Any, command),
        checkout=cast(Any, checkout),
    )

    command.outcome = CommerceCheckoutOutcome.FAILED
    with pytest.raises(Conflict, match="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED"):
        TortoiseCheckoutActivationRepository._validate_command(
            command=cast(Any, command),
            checkout=cast(Any, checkout),
        )
