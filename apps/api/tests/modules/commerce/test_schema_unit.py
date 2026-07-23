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
        "features": [
            {
                "key": "sites.generate",
                "label": "AI site generation",
                "included": True,
            }
        ],
        **overrides,
    }


def test_plan_price_accepts_whole_currency_cent() -> None:
    plan = CommercePlanUpsertRequest.model_validate(_plan_payload())

    assert plan.price_monthly_micros == 10_000


def test_plan_price_rejects_fractional_currency_cent() -> None:
    with pytest.raises(ValidationError, match="whole currency cents"):
        CommercePlanUpsertRequest.model_validate(_plan_payload(price_monthly_micros=1))


def test_plan_requires_every_registered_entitlement_key() -> None:
    with pytest.raises(ValidationError, match="sites.generate"):
        CommercePlanUpsertRequest.model_validate(_plan_payload(features=[]))


def test_plan_rejects_duplicate_feature_keys() -> None:
    feature = {
        "key": "sites.generate",
        "label": "AI site generation",
        "included": True,
    }

    with pytest.raises(ValidationError, match="unique keys"):
        CommercePlanUpsertRequest.model_validate(_plan_payload(features=[feature, feature]))


def test_plan_can_explicitly_exclude_a_registered_entitlement() -> None:
    plan = CommercePlanUpsertRequest.model_validate(
        _plan_payload(
            features=[
                {
                    "key": "sites.generate",
                    "label": "AI site generation",
                    "included": False,
                }
            ]
        )
    )

    assert plan.features[0].included is False
