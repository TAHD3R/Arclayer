from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import httpx
import pytest

from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.extensions.manager import ExtensionManager
from src.modules.commerce.billing_connector import BillingConnector
from src.modules.commerce.convergence.schema import PlanRevisionRef
from src.modules.commerce.subscription_transitions.schema import (
    ProviderRevisionSchedulingFacts,
    RenewalTransitionPreview,
)
from src.modules.commerce.top_up_settlement_evidence import ProviderTopUpSettlement


def _load_stripe_connector_type() -> type:
    plugin_path = Path(__file__).resolve().parents[5] / "plugins" / "arclayer-stripe" / "src" / "plugin.py"
    spec = importlib.util.spec_from_file_location("test_arclayer_stripe_plugin", plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Stripe Connector from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(type, module.__dict__["StripeBillingConnector"])


StripeBillingConnector: Any = _load_stripe_connector_type()


def test_stripe_registers_invoice_dunning_events_for_durable_acceptance() -> None:
    plugin_path = Path(__file__).resolve().parents[5] / "plugins" / "arclayer-stripe" / "src" / "plugin.py"
    spec = importlib.util.spec_from_file_location("test_arclayer_stripe_registration", plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Stripe Connector from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    registry = ExtensionManager(plugin_path.parents[3]).registry

    module.StripeBillingExtension().arclayer_register(registry)

    registration = registry.connectors.resolve("billing.stripe")
    assert registration is not None
    assert {
        "invoice.overpaid",
        "invoice.paid",
        "invoice.payment_failed",
        "invoice.payment_succeeded",
        "invoice.marked_uncollectible",
        "invoice_payment.paid",
    }.issubset(registration.definition.webhook_events)


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


def _subscription(
    *,
    subscription_id: str,
    status: str = "active",
    currency: str = "USD",
    external_price_id: str = "price_invoiceMonthly",
    period_start: int = 1_788_000_000,
    period_end: int = 1_790_678_400,
) -> dict[str, object]:
    return {
        "id": subscription_id,
        "customer": "cus_invoice123",
        "status": status,
        "metadata": {
            "workspace_id": str(uuid4()),
            "plan_id": str(uuid4()),
            "plan_revision_id": str(uuid4()),
            "external_price_id": external_price_id,
            "billing_cycle": "monthly",
            "currency": currency,
        },
        "items": {"data": [{"price": {"id": external_price_id, "currency": currency.lower()}}]},
        "current_period_start": period_start,
        "current_period_end": period_end,
        "cancel_at_period_end": False,
    }


def _invoice(
    *,
    subscription_id: str,
    status: str,
    invoice_id: str = "in_invoice123",
    currency: str = "usd",
    amount_due: int = 900,
    amount_paid: int = 0,
    billing_reason: str = "subscription_cycle",
    payments: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    paid_at = 1_790_000_000 if status == "paid" else None
    return {
        "object": "invoice",
        "id": invoice_id,
        "subscription": subscription_id,
        "status": status,
        "currency": currency,
        "amount_due": amount_due,
        "amount_paid": amount_paid,
        "period_start": 1_787_913_600,
        "period_end": 1_790_505_600,
        "created": 1_787_900_000,
        "billing_reason": billing_reason,
        "hosted_invoice_url": "https://invoice.stripe.test/in_invoice123",
        "payments": {"data": payments or [], "has_more": False},
        "attempt_count": 1,
        "status_transitions": {
            "finalized_at": 1_787_910_000,
            "paid_at": paid_at,
        },
    }


def _paid_invoice_payment(
    *,
    currency: str,
    amount_paid: int,
    payment_id: str = "inpay_payment123",
    invoice_id: str = "in_invoice123",
    amount_requested: int | None = None,
) -> dict:
    return {
        "object": "invoice_payment",
        "id": payment_id,
        "invoice": invoice_id,
        "status": "paid",
        "amount_requested": amount_paid if amount_requested is None else amount_requested,
        "amount_paid": amount_paid,
        "currency": currency,
        "created": 1_789_999_000,
        "status_transitions": {"paid_at": 1_790_000_000},
    }


@pytest.mark.asyncio
async def test_stripe_checkout_uses_exact_revision_price_and_subscription_metadata() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://stripe.test/v1/checkout/sessions"
        assert request.headers["Idempotency-Key"] == "arclayer:checkout:test-key"
        captured.update(dict(httpx.QueryParams(request.content.decode())))
        return httpx.Response(
            200,
            json={
                "id": "cs_test",
                "url": "https://checkout.stripe.test/cs_test",
                "expires_at": 1_800_000_000,
            },
        )

    provider = _provider(httpx.MockTransport(handler))
    workspace_id = str(uuid4())
    plan_id = str(uuid4())
    plan_revision_id = str(uuid4())
    result = await provider.create_checkout_session(
        workspace_id=workspace_id,
        plan_code="premium",
        plan_id=plan_id,
        plan_revision_id=plan_revision_id,
        external_price_id="price_premiumYearly",
        billing_cycle="yearly",
        currency="USD",
        success_url="https://app.example.test/?billing=success",
        cancel_url="https://app.example.test/?billing=canceled",
        customer_id=None,
        idempotency_key="arclayer:checkout:test-key",
    )

    assert result.url == "https://checkout.stripe.test/cs_test"
    assert result.external_session_id == "cs_test"
    assert result.provider_account_id == "platform"
    assert int(result.expires_at.timestamp()) == 1_800_000_000
    assert captured["line_items[0][price]"] == "price_premiumYearly"
    assert not any(key.startswith("line_items[0][price_data]") for key in captured)
    assert captured["subscription_data[metadata][workspace_id]"] == workspace_id
    assert captured["subscription_data[metadata][plan_id]"] == plan_id
    assert captured["subscription_data[metadata][plan_revision_id]"] == plan_revision_id
    assert captured["subscription_data[metadata][external_price_id]"] == "price_premiumYearly"
    assert captured["subscription_data[metadata][plan_code]"] == "premium"


@pytest.mark.asyncio
async def test_stripe_checkout_rejects_an_invalid_catalog_external_price_id() -> None:
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))

    with pytest.raises(BadRequest) as captured:
        await provider.create_checkout_session(
            workspace_id=str(uuid4()),
            plan_code="premium",
            plan_id=str(uuid4()),
            plan_revision_id=str(uuid4()),
            external_price_id="not-a-price",
            billing_cycle="monthly",
            currency="USD",
            success_url="https://app.example.test/?billing=success",
            cancel_url="https://app.example.test/?billing=canceled",
            customer_id=None,
            idempotency_key="arclayer:checkout:precision-key",
        )

    assert captured.value.error == "BILLING_PRICE_NOT_SUPPORTED"


@pytest.mark.asyncio
async def test_stripe_top_up_checkout_uses_exact_price_payment_metadata_and_customer() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://stripe.test/v1/checkout/sessions"
        assert request.headers["Idempotency-Key"] == "arclayer:top-up-checkout:unit"
        captured.update(dict(httpx.QueryParams(request.content.decode())))
        return httpx.Response(
            200,
            json={
                "id": "cs_topup123",
                "url": "https://checkout.stripe.test/cs_topup123",
                "expires_at": 1_800_000_000,
            },
        )

    provider = _provider(httpx.MockTransport(handler))
    workspace_id = str(uuid4())
    top_up_offer_id = str(uuid4())
    result = await provider.create_top_up_checkout_session(
        workspace_id=workspace_id,
        top_up_offer_id=top_up_offer_id,
        top_up_offer_revision=3,
        credit_amount=2_000,
        external_price_id="price_credits2000",
        currency="USD",
        amount_micros=20_000_000,
        success_url="https://app.example.test/?billing=top-up-success",
        cancel_url="https://app.example.test/?billing=top-up-canceled",
        customer_id="cus_test",
        idempotency_key="arclayer:top-up-checkout:unit",
    )

    metadata = {
        "workspace_id": workspace_id,
        "top_up_offer_id": top_up_offer_id,
        "top_up_offer_revision": "3",
        "credit_amount": "2000",
        "external_price_id": "price_credits2000",
        "currency": "USD",
        "amount_micros": "20000000",
    }
    expected = {
        "mode": "payment",
        "success_url": "https://app.example.test/?billing=top-up-success",
        "cancel_url": "https://app.example.test/?billing=top-up-canceled",
        "line_items[0][quantity]": "1",
        "line_items[0][price]": "price_credits2000",
        "invoice_creation[enabled]": "true",
        "customer": "cus_test",
    }
    for key, value in metadata.items():
        expected[f"metadata[{key}]"] = value
        expected[f"payment_intent_data[metadata][{key}]"] = value

    assert result.url == "https://checkout.stripe.test/cs_topup123"
    assert result.external_session_id == "cs_topup123"
    assert result.provider_account_id == "platform"
    assert int(result.expires_at.timestamp()) == 1_800_000_000
    assert captured == expected
    assert not any("price_data" in key for key in captured)


@pytest.mark.asyncio
async def test_stripe_top_up_checkout_requests_customer_creation_when_missing() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(dict(httpx.QueryParams(request.content.decode())))
        return httpx.Response(
            200,
            json={
                "id": "cs_topupcustomer123",
                "url": "https://checkout.stripe.test/cs_topupcustomer123",
                "expires_at": 1_800_000_000,
            },
        )

    provider = _provider(httpx.MockTransport(handler))
    await provider.create_top_up_checkout_session(
        workspace_id=str(uuid4()),
        top_up_offer_id=str(uuid4()),
        top_up_offer_revision=1,
        credit_amount=500,
        external_price_id="price_credits500",
        currency="USD",
        amount_micros=5_000_000,
        success_url="https://app.example.test/?billing=top-up-success",
        cancel_url="https://app.example.test/?billing=top-up-canceled",
        customer_id=None,
        idempotency_key="arclayer:top-up-checkout:create-customer",
    )

    assert captured["customer_creation"] == "always"
    assert "customer" not in captured


@pytest.mark.asyncio
async def test_stripe_top_up_checkout_rejects_invalid_price_before_provider_io() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(500)

    provider = _provider(httpx.MockTransport(handler))
    with pytest.raises(BadRequest) as captured:
        await provider.create_top_up_checkout_session(
            workspace_id=str(uuid4()),
            top_up_offer_id=str(uuid4()),
            top_up_offer_revision=1,
            credit_amount=2_000,
            external_price_id="not-a-price",
            currency="USD",
            amount_micros=20_000_000,
            success_url="https://app.example.test/?billing=top-up-success",
            cancel_url="https://app.example.test/?billing=top-up-canceled",
            customer_id="cus_test",
            idempotency_key="arclayer:top-up-checkout:unit",
        )

    assert captured.value.error == "BILLING_PRICE_NOT_SUPPORTED"
    assert requests == []


@pytest.mark.asyncio
async def test_stripe_top_up_checkout_rejects_invalid_provider_response() -> None:
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(200, json={"id": "cs_invalid"})))

    with pytest.raises(ServiceUnavailable) as captured:
        await provider.create_top_up_checkout_session(
            workspace_id=str(uuid4()),
            top_up_offer_id=str(uuid4()),
            top_up_offer_revision=1,
            credit_amount=2_000,
            external_price_id="price_credits2000",
            currency="USD",
            amount_micros=20_000_000,
            success_url="https://app.example.test/?billing=top-up-success",
            cancel_url="https://app.example.test/?billing=top-up-canceled",
            customer_id=None,
            idempotency_key="arclayer:top-up-checkout:invalid-response",
        )

    assert captured.value.error == "BILLING_PROVIDER_INVALID_RESPONSE"


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
    plan_id = str(uuid4())
    plan_revision_id = str(uuid4())
    subscription = {
        "id": "sub_123",
        "customer": "cus_123",
        "status": "active",
        "metadata": {
            "workspace_id": workspace_id,
            "plan_id": plan_id,
            "plan_revision_id": plan_revision_id,
            "external_price_id": "price_premiumMonthly",
            "billing_cycle": "monthly",
            "currency": "USD",
        },
        "items": {"data": [{"price": {"id": "price_premiumMonthly", "currency": "usd"}}]},
        "current_period_start": 1_788_000_000,
        "current_period_end": 1_790_678_400,
        "cancel_at_period_end": False,
        "schedule": "sub_sched_effective123",
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
    assert str(result.plan_id) == plan_id
    assert str(result.plan_revision_id) == plan_revision_id
    assert result.external_price_id == "price_premiumMonthly"
    assert result.subscription_id == "sub_123"
    assert result.confirmed_transition is not None
    assert result.confirmed_transition.provider_schedule_id == "sub_sched_effective123"
    assert str(result.confirmed_transition.target_revision_id) == plan_revision_id

    with pytest.raises(BadRequest) as captured:
        provider.verify_webhook(payload=payload, signature=f"t={int(time.time())},v1=invalid")
    assert captured.value.error == "BILLING_WEBHOOK_SIGNATURE_INVALID"


@pytest.mark.asyncio
async def test_stripe_schedules_exact_target_revision_with_provider_idempotency() -> None:
    workspace_id = uuid4()
    source_revision_id = uuid4()
    target_revision_id = uuid4()
    plan_id = uuid4()
    effective_at = datetime.fromtimestamp(1_790_678_400, tz=UTC)
    current_subscription = {
        "id": "sub_schedule123",
        "customer": "cus_schedule123",
        "status": "active",
        "metadata": {
            "workspace_id": str(workspace_id),
            "plan_id": str(plan_id),
            "plan_revision_id": str(source_revision_id),
            "external_price_id": "price_currentMonthly",
            "billing_cycle": "monthly",
            "currency": "USD",
        },
        "items": {"data": [{"price": {"id": "price_currentMonthly", "currency": "usd"}}]},
        "current_period_start": 1_788_000_000,
        "current_period_end": 1_790_678_400,
    }
    preview = RenewalTransitionPreview(
        id=uuid4(),
        workspace_id=workspace_id,
        source_revision=PlanRevisionRef(id=source_revision_id, plan_id=plan_id, code="source", is_free=False),
        target_revision=PlanRevisionRef(id=target_revision_id, plan_id=plan_id, code="target", is_free=False),
        expected_subscription_revision=1,
        effective_at=effective_at,
        preview_revision=1,
        preview_hash="revision-preview",
        provider_price_covered=True,
        provider_scheduling=ProviderRevisionSchedulingFacts(
            provider="stripe",
            provider_mode="test",
            external_subscription_id="sub_schedule123",
            external_price_id="price_targetMonthly",
            billing_cycle="monthly",
            currency="USD",
            amount_micros=2_000_000,
            effective_at=effective_at,
        ),
        incompatible_lifecycle_states=(),
        idempotency_key="preview-schedule",
        correlation_id=uuid4(),
    )
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(200, json=current_subscription)
        if request.url.path == "/v1/subscription_schedules":
            assert request.headers["Idempotency-Key"] == "transition-schedule"
            assert dict(httpx.QueryParams(request.content.decode())) == {"from_subscription": "sub_schedule123"}
            return httpx.Response(
                200,
                json={"id": "sub_sched_target123", "phases": [{"start_date": 1_788_000_000}]},
            )
        assert request.url.path == "/v1/subscription_schedules/sub_sched_target123"
        assert request.headers["Idempotency-Key"] == "transition-schedule:configure"
        data = dict(httpx.QueryParams(request.content.decode()))
        assert data["phases[0][end_date]"] == str(int(effective_at.timestamp()))
        assert data["phases[1][start_date]"] == str(int(effective_at.timestamp()))
        assert data["phases[1][items][0][price]"] == "price_targetMonthly"
        assert data["phases[1][metadata][plan_revision_id]"] == str(target_revision_id)
        return httpx.Response(200, json={"id": "sub_sched_target123"})

    provider = cast(Any, _provider(httpx.MockTransport(handler)))
    schedule_id = await provider.schedule_subscription_revision(
        preview=preview,
        idempotency_key="transition-schedule",
    )

    assert schedule_id == "sub_sched_target123"
    assert [request.method for request in requests] == ["GET", "POST", "POST"]


@pytest.mark.asyncio
async def test_stripe_webhook_rejects_price_that_differs_from_signed_metadata() -> None:
    subscription = {
        "id": "sub_mismatch123",
        "customer": "cus_mismatch123",
        "status": "active",
        "metadata": {
            "workspace_id": str(uuid4()),
            "plan_id": str(uuid4()),
            "plan_revision_id": str(uuid4()),
            "external_price_id": "price_expected123",
            "billing_cycle": "monthly",
            "currency": "USD",
        },
        "items": {"data": [{"price": {"id": "price_other123", "currency": "usd"}}]},
        "current_period_start": 1_788_000_000,
        "current_period_end": 1_790_678_400,
    }
    payload = json.dumps(
        {"id": "evt_mismatch123", "type": "customer.subscription.updated", "data": {"object": subscription}},
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"


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
    plan_id = str(uuid4())
    plan_revision_id = str(uuid4())
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
                    "plan_id": plan_id,
                    "plan_revision_id": plan_revision_id,
                    "external_price_id": "price_deferredMonthly",
                    "billing_cycle": "monthly",
                    "currency": "USD",
                },
                "items": {"data": [{"price": {"id": "price_deferredMonthly", "currency": "usd"}}]},
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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_type", "invoice_status", "invoice_overrides", "subscription_status", "expected_kind"),
    [
        (
            "invoice.payment_failed",
            "open",
            {"next_payment_attempt": 1_790_678_400},
            "past_due",
            "payment_failure",
        ),
        (
            "invoice.payment_succeeded",
            "paid",
            {
                "amount_paid": 900,
                "attempt_count": 2,
                "payments": {
                    "data": [
                        _paid_invoice_payment(
                            currency="usd",
                            amount_paid=900,
                            invoice_id="in_dunning123",
                        )
                    ],
                    "has_more": False,
                },
                "status_transitions": {"paid_at": 1_790_678_400},
            },
            "active",
            "payment_recovered",
        ),
        (
            "invoice.marked_uncollectible",
            "uncollectible",
            {"status_transitions": {"marked_uncollectible_at": 1_790_678_400}},
            "past_due",
            "final_unpaid",
        ),
    ],
)
async def test_stripe_invoice_events_emit_only_exact_dunning_facts(
    event_type: str,
    invoice_status: str,
    invoice_overrides: dict[str, object],
    subscription_status: str,
    expected_kind: str,
) -> None:
    subscription = _subscription(
        subscription_id="sub_dunning123",
        status=subscription_status,
        external_price_id="price_dunningMonthly",
    )
    invoice = _invoice(
        subscription_id="sub_dunning123",
        status=invoice_status,
        invoice_id="in_dunning123",
    )
    invoice.update({key: value for key, value in invoice_overrides.items() if key != "status_transitions"})
    transitions = cast(dict[str, object], invoice["status_transitions"])
    transitions.update(cast(dict[str, object], invoice_overrides.get("status_transitions", {})))
    event = {
        "id": "evt_dunning123",
        "type": event_type,
        "created": 1_789_000_000,
        "data": {"object": invoice},
    }
    payload = json.dumps(event, separators=(",", ":")).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(200, json=subscription)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    result = await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert result is not None
    assert result.dunning_event is not None
    assert result.dunning_event.kind == expected_kind
    assert result.dunning_event.provider_period_id == "in_dunning123"
    assert result.payment is not None
    assert result.payment.external_invoice_id == "in_dunning123"


@pytest.mark.asyncio
async def test_stripe_payment_failure_rejects_missing_provider_recovery_deadline() -> None:
    invoice = _invoice(subscription_id="sub_missingdeadline123", status="open")
    invoice["id"] = "in_missingdeadline123"
    event = {
        "id": "evt_missingdeadline123",
        "type": "invoice.payment_failed",
        "created": 1_789_000_000,
        "data": {"object": invoice},
    }
    payload = json.dumps(event, separators=(",", ":")).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("currency", "minor_amount", "expected_micros", "billing_reason", "expected_kind"),
    (
        ("USD", 900, 9_000_000, "subscription_create", "subscription"),
        ("JPY", 900, 900_000_000, "subscription_cycle", "renewal"),
    ),
)
async def test_stripe_paid_invoice_projects_exact_invoice_payment_allocation(
    currency: str,
    minor_amount: int,
    expected_micros: int,
    billing_reason: str,
    expected_kind: str,
) -> None:
    subscription = _subscription(
        subscription_id="sub_invoice123",
        currency=currency,
        external_price_id="price_invoiceCurrency123",
    )
    invoice = _invoice(
        subscription_id="sub_invoice123",
        status="paid",
        currency=currency.lower(),
        amount_due=minor_amount,
        amount_paid=minor_amount,
        billing_reason=billing_reason,
        payments=[_paid_invoice_payment(currency=currency.lower(), amount_paid=minor_amount)],
    )
    payload = json.dumps(
        {
            "id": "evt_invoicepaid123",
            "type": "invoice.paid",
            "created": 1_790_000_100,
            "data": {"object": invoice},
        },
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(200, json=subscription)))

    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))
    result = await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert result is not None
    assert result.payment is not None
    assert result.payment.currency == currency
    assert result.payment.amount_due_micros == expected_micros
    assert result.payment.amount_paid_micros == expected_micros
    assert result.payment.period_start != result.current_period_start
    assert len(result.payment.transactions) == 1
    transaction = result.payment.transactions[0]
    assert transaction.external_transaction_id == "inpay_payment123"
    assert transaction.kind == expected_kind
    assert transaction.status == "succeeded"
    assert transaction.amount_micros == expected_micros


@pytest.mark.asyncio
async def test_stripe_overpaid_invoice_preserves_amount_above_amount_due() -> None:
    subscription = _subscription(subscription_id="sub_overpaid123")
    invoice = _invoice(
        subscription_id="sub_overpaid123",
        status="paid",
        amount_due=900,
        amount_paid=1_000,
        payments=[_paid_invoice_payment(currency="usd", amount_paid=1_000)],
    )
    payload = json.dumps(
        {
            "id": "evt_overpaid123",
            "type": "invoice.overpaid",
            "created": 1_790_000_100,
            "data": {"object": invoice},
        },
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(200, json=subscription)))

    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))
    result = await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert result is not None
    assert result.payment is not None
    assert result.payment.amount_due_micros == 9_000_000
    assert result.payment.amount_paid_micros == 10_000_000


@pytest.mark.asyncio
async def test_stripe_partial_payment_projects_without_claiming_invoice_paid() -> None:
    subscription = _subscription(subscription_id="sub_partial123")
    invoice = _invoice(
        subscription_id="sub_partial123",
        status="open",
        amount_paid=400,
        payments=[_paid_invoice_payment(currency="usd", amount_paid=400)],
    )
    payload = json.dumps(
        {
            "id": "evt_partial123",
            "type": "invoice.payment_succeeded",
            "created": 1_790_000_100,
            "data": {"object": invoice},
        },
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(200, json=subscription)))

    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))
    result = await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert result is not None
    assert result.dunning_event is None
    assert result.payment is not None
    assert result.payment.status == "open"
    assert result.payment.amount_paid_micros == 4_000_000
    assert result.payment.transactions[0].external_transaction_id == "inpay_payment123"


@pytest.mark.asyncio
async def test_stripe_invoice_payment_paid_fetches_expanded_invoice_and_projects_allocation() -> None:
    invoice_id = "in_invoicepayment123"
    subscription_id = "sub_invoicepayment123"
    payment = _paid_invoice_payment(
        currency="usd",
        amount_paid=400,
        payment_id="inpay_eventpayment123",
        invoice_id=invoice_id,
    )
    invoice = _invoice(
        subscription_id=subscription_id,
        status="open",
        invoice_id=invoice_id,
        amount_paid=400,
        payments=[payment],
    )
    subscription = _subscription(subscription_id=subscription_id)
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == f"/v1/invoices/{invoice_id}":
            assert request.url.params.get("expand[]") == "payments.data"
            return httpx.Response(200, json=invoice)
        assert request.url.path == f"/v1/subscriptions/{subscription_id}"
        return httpx.Response(200, json=subscription)

    payload = json.dumps(
        {
            "id": "evt_invoicepaymentpaid123",
            "type": "invoice_payment.paid",
            "created": 1_790_000_100,
            "data": {"object": payment},
        },
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(handler))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    result = await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert result is not None
    assert result.payment is not None
    assert result.payment.status == "open"
    assert result.payment.transactions[0].external_transaction_id == "inpay_eventpayment123"
    assert [request.url.path for request in requests] == [
        f"/v1/invoices/{invoice_id}",
        f"/v1/subscriptions/{subscription_id}",
    ]


@pytest.mark.asyncio
async def test_stripe_invoice_payment_paid_rejects_event_that_does_not_match_expanded_invoice() -> None:
    invoice_id = "in_invoicepaymentmismatch123"
    event_payment = _paid_invoice_payment(
        currency="usd",
        amount_paid=400,
        payment_id="inpay_mismatch123",
        invoice_id=invoice_id,
    )
    invoice_payment = {**event_payment, "amount_paid": 300, "amount_requested": 300}
    invoice = _invoice(
        subscription_id="sub_invoicepaymentmismatch123",
        status="open",
        invoice_id=invoice_id,
        amount_paid=300,
        payments=[invoice_payment],
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == f"/v1/invoices/{invoice_id}"
        return httpx.Response(200, json=invoice)

    payload = json.dumps(
        {
            "id": "evt_invoicepaymentmismatch123",
            "type": "invoice_payment.paid",
            "created": 1_790_000_100,
            "data": {"object": event_payment},
        },
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(handler))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payments",
    (
        {"data": []},
        {"has_more": False},
    ),
)
async def test_stripe_invoice_rejects_incomplete_invoice_payment_container(
    payments: dict[str, object],
) -> None:
    invoice = _invoice(subscription_id="sub_missingpaymentfields123", status="open")
    invoice["payments"] = payments
    payload = json.dumps(
        {
            "id": "evt_missingpaymentfields123",
            "type": "invoice.payment_succeeded",
            "created": 1_790_000_100,
            "data": {"object": invoice},
        },
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_type", "amount_due", "amount_paid", "payment"),
    (
        (
            "invoice.payment_succeeded",
            900,
            400,
            _paid_invoice_payment(currency="usd", amount_paid=500),
        ),
        (
            "invoice.payment_succeeded",
            900,
            400,
            _paid_invoice_payment(currency="usd", amount_paid=400, invoice_id="in_anotherinvoice123"),
        ),
        (
            "invoice.payment_succeeded",
            900,
            400,
            _paid_invoice_payment(currency="usd", amount_paid=400, amount_requested=399),
        ),
        (
            "invoice.overpaid",
            900,
            900,
            _paid_invoice_payment(currency="usd", amount_paid=900),
        ),
    ),
)
async def test_stripe_invoice_rejects_inconsistent_payment_allocation_facts(
    event_type: str,
    amount_due: int,
    amount_paid: int,
    payment: dict[str, object],
) -> None:
    invoice = _invoice(
        subscription_id="sub_inconsistentpayment123",
        status="paid" if event_type == "invoice.overpaid" else "open",
        amount_due=amount_due,
        amount_paid=amount_paid,
        payments=[payment],
    )
    payload = json.dumps(
        {
            "id": "evt_inconsistentpayment123",
            "type": event_type,
            "created": 1_790_000_100,
            "data": {"object": invoice},
        },
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"


@pytest.mark.asyncio
async def test_stripe_invoice_rejects_incomplete_invoice_payment_collection() -> None:
    invoice = _invoice(subscription_id="sub_incompletepayments123", status="paid", amount_paid=900)
    invoice["payments"] = {
        "data": [_paid_invoice_payment(currency="usd", amount_paid=900)],
        "has_more": True,
    }
    payload = json.dumps(
        {
            "id": "evt_incompletepayments123",
            "type": "invoice.paid",
            "created": 1_790_000_100,
            "data": {"object": invoice},
        },
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"


@pytest.mark.asyncio
async def test_stripe_subscription_rejects_unsupported_trialing_state() -> None:
    subscription = _subscription(subscription_id="sub_trialing123", status="trialing")
    payload = json.dumps(
        {
            "id": "evt_trialing123",
            "type": "customer.subscription.updated",
            "data": {"object": subscription},
        },
        separators=(",", ":"),
    ).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"


@pytest.mark.asyncio
async def test_stripe_payment_checkout_normalizes_top_up_with_job_time_expansions() -> None:
    workspace_id = uuid4()
    offer_id = uuid4()
    metadata = {
        "workspace_id": str(workspace_id),
        "top_up_offer_id": str(offer_id),
        "top_up_offer_revision": "4",
        "credit_amount": "2000",
        "external_price_id": "price_credits2000",
        "currency": "USD",
        "amount_micros": "20000000",
    }
    event = {
        "id": "evt_topupnormalize123",
        "type": "checkout.session.completed",
        "livemode": False,
        "created": 1_790_000_100,
        "data": {"object": {"id": "cs_topupnormalize123", "mode": "payment", "metadata": metadata}},
    }
    checkout = {
        "id": "cs_topupnormalize123",
        "mode": "payment",
        "livemode": False,
        "metadata": metadata,
        "amount_total": 2000,
        "currency": "usd",
        "line_items": {
            "data": [{"quantity": 1, "price": {"id": "price_credits2000", "currency": "usd"}}],
            "has_more": False,
        },
        "payment_intent": {
            "id": "pi_topupnormalize123",
            "status": "succeeded",
            "amount_received": 2000,
            "currency": "usd",
            "metadata": metadata,
        },
        "invoice": {
            "id": "in_topupnormalize123",
            "status": "paid",
            "currency": "usd",
            "amount_due": 2000,
            "amount_paid": 2000,
        },
    }
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=checkout)

    provider = _provider(httpx.MockTransport(handler))
    payload = json.dumps(event, separators=(",", ":")).encode()
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    result = await provider.top_up_settlement_from_event(payload=payload, envelope=envelope)

    assert isinstance(result, ProviderTopUpSettlement)
    assert result.workspace_id == workspace_id
    assert result.top_up_offer_id == offer_id
    assert result.checkout_session_id is None
    assert result.actor_user_id is None
    assert result.checkout_request_fingerprint is None
    assert result.external_transaction_id == "pi_topupnormalize123"
    assert result.external_invoice_id == "in_topupnormalize123"
    assert requests[0].url.params.get_list("expand[]") == ["line_items.data.price", "payment_intent", "invoice"]


@pytest.mark.asyncio
async def test_stripe_payment_checkout_does_not_enter_subscription_normalization() -> None:
    event = {
        "id": "evt_topupsubscriptionguard123",
        "type": "checkout.session.completed",
        "livemode": False,
        "data": {"object": {"id": "cs_topupsubscriptionguard123", "mode": "payment", "metadata": {}}},
    }
    payload = json.dumps(event, separators=(",", ":")).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    assert await provider.subscription_from_event(payload=payload, envelope=envelope) is None


@pytest.mark.asyncio
async def test_stripe_top_up_rejects_unpaid_payment_intent() -> None:
    workspace_id = uuid4()
    offer_id = uuid4()
    metadata = {
        "workspace_id": str(workspace_id),
        "top_up_offer_id": str(offer_id),
        "top_up_offer_revision": "1",
        "credit_amount": "500",
        "external_price_id": "price_credits500",
        "currency": "USD",
        "amount_micros": "5000000",
    }
    event = {
        "id": "evt_topupunpaid123",
        "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_topupunpaid123", "mode": "payment", "metadata": metadata}},
    }
    checkout = {
        "id": "cs_topupunpaid123",
        "mode": "payment",
        "metadata": metadata,
        "amount_total": 500,
        "currency": "usd",
        "line_items": {"data": [{"quantity": 1, "price": {"id": "price_credits500", "currency": "usd"}}]},
        "payment_intent": {
            "id": "pi_topupunpaid123",
            "status": "requires_payment_method",
            "amount_received": 0,
            "currency": "usd",
            "metadata": metadata,
        },
    }
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(200, json=checkout)))
    payload = json.dumps(event, separators=(",", ":")).encode()
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.top_up_settlement_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"
