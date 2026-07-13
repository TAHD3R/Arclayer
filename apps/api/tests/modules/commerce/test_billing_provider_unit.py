from __future__ import annotations

import hashlib
import hmac
import json
import time
from uuid import uuid4

import httpx
import pytest

from src.core.exceptions import BadRequest
from src.modules.commerce.billing_provider import StripeBillingProvider


def _provider(handler: httpx.MockTransport) -> StripeBillingProvider:
    return StripeBillingProvider(
        secret_key="sk_test_unit",
        webhook_secret="whsec_unit",
        api_base_url="https://stripe.test/v1",
        webhook_tolerance_seconds=300,
        client=httpx.AsyncClient(transport=handler),
    )


def _signature(payload: bytes) -> str:
    timestamp = int(time.time())
    digest = hmac.new(
        b"whsec_unit",
        str(timestamp).encode() + b"." + payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


@pytest.mark.asyncio
async def test_stripe_checkout_uses_exact_smallest_currency_unit_and_subscription_metadata() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://stripe.test/v1/checkout/sessions"
        captured.update(dict(httpx.QueryParams(request.content.decode())))
        return httpx.Response(200, json={"id": "cs_test", "url": "https://checkout.stripe.test/cs_test"})

    provider = _provider(httpx.MockTransport(handler))
    workspace_id = str(uuid4())
    result = await provider.create_checkout_session(
        workspace_id=workspace_id,
        plan_code="premium",
        plan_name="Premium",
        billing_cycle="yearly",
        currency="USD",
        amount_micros=190_000_000,
        success_url="https://app.example.test/?billing=success",
        cancel_url="https://app.example.test/?billing=canceled",
        customer_id=None,
    )

    assert result.url == "https://checkout.stripe.test/cs_test"
    assert captured["line_items[0][price_data][unit_amount]"] == "19000"
    assert captured["line_items[0][price_data][recurring][interval]"] == "year"
    assert captured["subscription_data[metadata][workspace_id]"] == workspace_id
    assert captured["subscription_data[metadata][plan_code]"] == "premium"


@pytest.mark.asyncio
async def test_stripe_checkout_rejects_prices_that_cannot_be_represented_in_cents() -> None:
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))

    with pytest.raises(BadRequest) as captured:
        await provider.create_checkout_session(
            workspace_id=str(uuid4()),
            plan_code="precision",
            plan_name="Precision",
            billing_cycle="monthly",
            currency="USD",
            amount_micros=1,
            success_url="https://app.example.test/?billing=success",
            cancel_url="https://app.example.test/?billing=canceled",
            customer_id=None,
        )

    assert captured.value.error == "BILLING_PRICE_NOT_SUPPORTED"


@pytest.mark.asyncio
async def test_stripe_webhook_requires_valid_signature_and_parses_subscription_state() -> None:
    workspace_id = str(uuid4())
    subscription = {
        "id": "sub_123",
        "customer": "cus_123",
        "status": "active",
        "metadata": {
            "workspace_id": workspace_id,
            "plan_code": "premium",
            "billing_cycle": "monthly",
        },
        "current_period_start": 1_788_000_000,
        "current_period_end": 1_790_678_400,
        "cancel_at_period_end": False,
    }
    event = {
        "id": "evt_123",
        "type": "customer.subscription.updated",
        "data": {"object": subscription},
    }
    payload = json.dumps(event, separators=(",", ":")).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))

    result = await provider.subscription_from_webhook(
        payload=payload,
        signature=_signature(payload),
    )

    assert result is not None
    assert result.event_id == "evt_123"
    assert result.workspace_id == workspace_id
    assert result.plan_code == "premium"
    assert result.subscription_id == "sub_123"

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_webhook(
            payload=payload,
            signature=f"t={int(time.time())},v1=invalid",
        )
    assert captured.value.error == "BILLING_WEBHOOK_SIGNATURE_INVALID"


@pytest.mark.asyncio
async def test_checkout_webhook_rejects_subscription_id_that_is_not_a_stripe_identifier() -> None:
    event = {
        "id": "evt_invalid_subscription",
        "type": "checkout.session.completed",
        "data": {"object": {"subscription": "../customers/cus_test"}},
    }
    payload = json.dumps(event, separators=(",", ":")).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_webhook(payload=payload, signature=_signature(payload))

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"
