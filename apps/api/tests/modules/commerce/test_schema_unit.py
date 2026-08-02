from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from src.models.commerce.billing import BillingCycle, CreditRefreshInterval
from src.modules.commerce.schema import CheckoutSessionCreate
from src.modules.commerce.service import _credits_out


def test_checkout_request_uses_stable_plan_code_and_explicit_billing_interval() -> None:
    request = CheckoutSessionCreate(plan_code="premium", billing_interval=BillingCycle.MONTHLY)

    assert request.plan_code == "premium"
    assert request.billing_interval == BillingCycle.MONTHLY


def test_checkout_request_rejects_invalid_plan_code() -> None:
    with pytest.raises(ValidationError):
        CheckoutSessionCreate(plan_code="Premium", billing_interval=BillingCycle.MONTHLY)


def test_workspace_credit_projection_exposes_the_locked_account_revision() -> None:
    period_start = datetime.now(UTC)
    account = SimpleNamespace(
        revision=7,
        balance_credits=100,
        reserved_credits=25,
        period_start=period_start,
        period_end=period_start + timedelta(days=30),
    )
    revision = SimpleNamespace(credit_refresh_interval=CreditRefreshInterval.MONTHLY)

    projected = _credits_out(account, revision)  # type: ignore[arg-type]

    assert projected.account_revision == 7
    assert projected.available == 75
