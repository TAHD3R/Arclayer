from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
import time
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import httpx
import pytest

from src.core.exceptions import BadRequest
from src.modules.commerce.billing_connector import BillingConnector


def _load_stripe_connector_type() -> type:
    plugin_path = Path(__file__).resolve().parents[5] / "plugins" / "arclayer-stripe" / "src" / "plugin.py"
    spec = importlib.util.spec_from_file_location("test_arclayer_stripe_plugin", plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Stripe Connector from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(type, module.__dict__["StripeBillingConnector"])


StripeBillingConnector: Any = _load_stripe_connector_type()


def _provider(handler: httpx.MockTransport) -> BillingConnector:
    return StripeBillingConnector(
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
        assert request.headers["Idempotency-Key"] == "arclayer:checkout:test-key"
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
        idempotency_key="arclayer:checkout:test-key",
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
            idempotency_key="arclayer:checkout:precision-key",
        )

    assert captured.value.error == "BILLING_PRICE_NOT_SUPPORTED"


@pytest.mark.asyncio
async def test_stripe_portal_carries_the_business_idempotency_key() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://stripe.test/v1/billing_portal/sessions"
        assert request.headers["Idempotency-Key"] == "arclayer:portal:test-key"
        captured.update(dict(httpx.QueryParams(request.content.decode())))
        return httpx.Response(200, json={"url": "https://billing.stripe.test/session"})

    provider = _provider(httpx.MockTransport(handler))
    result = await provider.create_portal_session(
        customer_id="cus_test",
        return_url="https://app.example.test/settings/billing",
        idempotency_key="arclayer:portal:test-key",
    )

    assert result.url == "https://billing.stripe.test/session"
    assert captured == {
        "customer": "cus_test",
        "return_url": "https://app.example.test/settings/billing",
    }


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

    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))
    result = await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert result is not None
    assert result.event_id == "evt_123"
    assert str(result.workspace_id) == workspace_id
    assert result.plan_code == "premium"
    assert result.subscription_id == "sub_123"

    with pytest.raises(BadRequest) as captured:
        provider.verify_webhook(payload=payload, signature=f"t={int(time.time())},v1=invalid")
    assert captured.value.error == "BILLING_WEBHOOK_SIGNATURE_INVALID"


@pytest.mark.asyncio
async def test_checkout_webhook_rejects_subscription_id_that_is_not_a_stripe_identifier() -> None:
    event = {
        "id": "evt_invalidsubscription",
        "type": "checkout.session.completed",
        "data": {"object": {"subscription": "../customers/cus_test"}},
    }
    payload = json.dumps(event, separators=(",", ":")).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"


@pytest.mark.asyncio
async def test_checkout_webhook_verification_defers_subscription_fetch_to_worker_processing() -> None:
    workspace_id = str(uuid4())
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "id": "sub_deferred123",
                "customer": "cus_deferred123",
                "status": "active",
                "metadata": {
                    "workspace_id": workspace_id,
                    "plan_code": "premium",
                    "billing_cycle": "monthly",
                },
                "current_period_start": 1_788_000_000,
                "current_period_end": 1_790_678_400,
                "cancel_at_period_end": False,
            },
        )

    event = {
        "id": "evt_deferred123",
        "type": "checkout.session.completed",
        "livemode": False,
        "data": {"object": {"subscription": "sub_deferred123"}},
    }
    payload = json.dumps(event, separators=(",", ":")).encode()
    provider = _provider(httpx.MockTransport(handler))

    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    assert requests == []
    result = await provider.subscription_from_event(payload=payload, envelope=envelope)
    assert result is not None
    assert result.subscription_id == "sub_deferred123"
    assert [request.url.path for request in requests] == ["/v1/subscriptions/sub_deferred123"]
