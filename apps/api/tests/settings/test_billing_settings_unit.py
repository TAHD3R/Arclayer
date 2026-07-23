from __future__ import annotations

from src.settings.env_models import BillingSettings


def test_billing_settings_parse_stable_stripe_price_ids(monkeypatch) -> None:
    monkeypatch.setenv(
        "BILLING__STRIPE_PRICE_IDS",
        '{"premium:monthly:USD":"price_premiumMonthly","premium:yearly:USD":"price_premiumYearly"}',
    )

    settings = BillingSettings(_env_file=None)

    assert settings.stripe_price_ids == {
        "premium:monthly:USD": "price_premiumMonthly",
        "premium:yearly:USD": "price_premiumYearly",
    }


def test_checkout_requires_price_mapping_without_disabling_webhooks() -> None:
    without_prices = BillingSettings(
        provider="stripe",
        stripe_secret_key="sk_test_unit",
        stripe_webhook_secret="whsec_unit",
    )
    with_prices = without_prices.model_copy(
        update={"stripe_price_ids": {"premium:monthly:USD": "price_premiumMonthly"}},
    )

    assert without_prices.checkout_enabled is False
    assert without_prices.webhook_enabled is True
    assert with_prices.checkout_enabled is True
    assert with_prices.webhook_enabled is True
