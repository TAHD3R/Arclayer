from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.commerce.billing import CommercePlanTier, CreditRefreshInterval
from src.modules.commerce.schema import CommercePlanUpsertRequest


def _plan_payload(**overrides: object) -> dict[str, object]:
    return {
        "tier": CommercePlanTier.PREMIUM,
        "name": "Premium",
        "description": "Provider-backed premium plan",
        "credit_grant_amount": 10_000,
        "credit_refresh_interval": CreditRefreshInterval.MONTHLY,
        "credit_value_micros": 1_000,
        "price_monthly_micros": 10_000,
        "price_yearly_micros": 120_000,
        "currency": "USD",
        **overrides,
    }


def test_plan_price_accepts_whole_currency_cent() -> None:
    plan = CommercePlanUpsertRequest.model_validate(_plan_payload())

    assert plan.price_monthly_micros == 10_000


def test_plan_price_rejects_fractional_currency_cent() -> None:
    with pytest.raises(ValidationError, match="whole currency cents"):
        CommercePlanUpsertRequest.model_validate(_plan_payload(price_monthly_micros=1))
