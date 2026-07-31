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

from src.core.exceptions import BadRequest
from src.core.extensions.manager import ExtensionManager
from src.modules.commerce.billing_connector import BillingConnector
from src.modules.commerce.convergence.schema import PlanRevisionRef
from src.modules.commerce.subscription_transitions.schema import (
    ProviderRevisionSchedulingFacts,
    RenewalTransitionPreview,
)


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
        "invoice.payment_failed",
        "invoice.payment_succeeded",
        "invoice.marked_uncollectible",
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


@pytest.mark.asyncio
async def test_stripe_checkout_uses_exact_revision_price_and_subscription_metadata() -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://stripe.test/v1/checkout/sessions"
        assert request.headers["Idempotency-Key"] == "arclayer:checkout:test-key"
        captured.update(dict(httpx.QueryParams(request.content.decode())))
        return httpx.Response(200, json={"id": "cs_test", "url": "https://checkout.stripe.test/cs_test"})

    provider = _provider(httpx.MockTransport(handler))
    workspace_id = str(uuid4())
    plan_id = str(uuid4())
    plan_revision_id = str(uuid4())
    result = await provider.create_checkout_session(
        workspace_id=workspace_id,
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
    assert captured["line_items[0][price]"] == "price_premiumYearly"
    assert not any(key.startswith("line_items[0][price_data]") for key in captured)
    assert captured["subscription_data[metadata][workspace_id]"] == workspace_id
    assert captured["subscription_data[metadata][plan_id]"] == plan_id
    assert captured["subscription_data[metadata][plan_revision_id]"] == plan_revision_id
    assert captured["subscription_data[metadata][external_price_id]"] == "price_premiumYearly"
    assert "subscription_data[metadata][plan_code]" not in captured


@pytest.mark.asyncio
async def test_stripe_checkout_rejects_an_invalid_catalog_external_price_id() -> None:
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))

    with pytest.raises(BadRequest) as captured:
        await provider.create_checkout_session(
            workspace_id=str(uuid4()),
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
    ("event_type", "invoice", "expected_kind"),
    [
        (
            "invoice.payment_failed",
            {"next_payment_attempt": 1_790_678_400},
            "payment_failure",
        ),
        (
            "invoice.payment_succeeded",
            {"attempt_count": 2, "status_transitions": {"paid_at": 1_790_678_400}},
            "payment_recovered",
        ),
        (
            "invoice.marked_uncollectible",
            {"status_transitions": {"marked_uncollectible_at": 1_790_678_400}},
            "final_unpaid",
        ),
    ],
)
async def test_stripe_invoice_events_emit_only_exact_dunning_facts(
    event_type: str,
    invoice: dict[str, object],
    expected_kind: str,
) -> None:
    subscription = {
        "id": "sub_dunning123",
        "customer": "cus_dunning123",
        "status": "past_due",
        "metadata": {
            "workspace_id": str(uuid4()),
            "plan_id": str(uuid4()),
            "plan_revision_id": str(uuid4()),
            "external_price_id": "price_dunningMonthly",
            "billing_cycle": "monthly",
            "currency": "USD",
        },
        "items": {"data": [{"price": {"id": "price_dunningMonthly", "currency": "usd"}}]},
        "current_period_start": 1_788_000_000,
        "current_period_end": 1_790_678_400,
    }
    event = {
        "id": "evt_dunning123",
        "type": event_type,
        "created": 1_789_000_000,
        "data": {
            "object": {
                "id": "in_dunning123",
                "subscription": "sub_dunning123",
                "attempt_count": 1,
                **invoice,
            }
        },
    }
    payload = json.dumps(event, separators=(",", ":")).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(200, json=subscription)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    result = await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert result is not None
    assert result.dunning_event is not None
    assert result.dunning_event.kind == expected_kind
    assert result.dunning_event.provider_period_id == "in_dunning123"


@pytest.mark.asyncio
async def test_stripe_payment_failure_rejects_missing_provider_recovery_deadline() -> None:
    event = {
        "id": "evt_missingdeadline123",
        "type": "invoice.payment_failed",
        "created": 1_789_000_000,
        "data": {
            "object": {
                "id": "in_missingdeadline123",
                "subscription": "sub_missingdeadline123",
                "attempt_count": 1,
            }
        },
    }
    payload = json.dumps(event, separators=(",", ":")).encode()
    provider = _provider(httpx.MockTransport(lambda _request: httpx.Response(500)))
    envelope = provider.verify_webhook(payload=payload, signature=_signature(payload))

    with pytest.raises(BadRequest) as captured:
        await provider.subscription_from_event(payload=payload, envelope=envelope)

    assert captured.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"
