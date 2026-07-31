from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.commerce.billing import BillingCycle
from src.modules.commerce.schema import CheckoutSessionCreate


def test_checkout_request_uses_stable_plan_code_and_explicit_billing_interval() -> None:
    request = CheckoutSessionCreate(plan_code="premium", billing_interval=BillingCycle.MONTHLY)

    assert request.plan_code == "premium"
    assert request.billing_interval == BillingCycle.MONTHLY


def test_checkout_request_rejects_invalid_plan_code() -> None:
    with pytest.raises(ValidationError):
        CheckoutSessionCreate(plan_code="Premium", billing_interval=BillingCycle.MONTHLY)
