from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
import time
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import pytest

from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.extensions.manager import ExtensionManager
from src.modules.commerce.billing_connector import BillingConnector


def _load_simulated_connector_type() -> type:
    plugin_path = Path(__file__).resolve().parents[5] / "plugins" / "arclayer-simulated-billing" / "src" / "plugin.py"
    spec = importlib.util.spec_from_file_location("test_arclayer_simulated_billing_plugin", plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load simulated billing Connector from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(type, module.__dict__["SimulatedBillingConnector"])


SimulatedBillingConnector: Any = _load_simulated_connector_type()


def _connector() -> BillingConnector:
    return SimulatedBillingConnector(
        signing_secret="simulated-unit-secret",
        webhook_tolerance_seconds=300,
    )


def _payload(*, timestamp: int, outcome: str = "succeeded") -> bytes:
    return json.dumps(
        {
            "id": "sim_evt_unit123",
            "type": "checkout.session.outcome",
            "mode": "test",
            "account": "platform",
            "created": timestamp,
            "data": {
                "actor_user_id": str(uuid4()),
                "checkout_request_fingerprint": "a" * 64,
                "checkout_session_id": str(uuid4()),
                "command_idempotency_key_hash": "b" * 64,
                "expected_revision": 1,
                "external_price_id": "sim_price_premium_monthly",
                "external_session_id": "sim_cs_unit123",
                "outcome": outcome,
                "plan_code": "premium",
                "plan_revision_id": str(uuid4()),
                "workspace_id": str(uuid4()),
            },
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()


def _subscription_payload(
    *,
    timestamp: int,
    workspace_id: str,
    plan_id: str,
    plan_revision_id: str,
    checkout_activation: dict[str, str] | None = None,
    dunning: dict[str, object] | None = None,
    payment: dict[str, object] | None = None,
    status: str = "active",
) -> bytes:
    data: dict[str, object] = {
        "billing_cycle": "monthly",
        "cancel_at_period_end": False,
        "currency": "USD",
        "current_period_end": timestamp + 2_592_000,
        "current_period_start": timestamp,
        "customer_id": "sim_cus_unit123",
        "external_price_id": "sim_price_premium_monthly",
        "plan_id": plan_id,
        "plan_revision_id": plan_revision_id,
        "status": status,
        "subscription_id": "sim_sub_unit123",
        "workspace_id": workspace_id,
    }
    if checkout_activation is not None:
        data["checkout_activation"] = checkout_activation
    if dunning is not None:
        data["dunning"] = dunning
    if payment is not None:
        data["payment"] = payment
    return json.dumps(
        {
            "id": "sim_evt_subscription123",
            "type": "subscription.lifecycle",
            "mode": "test",
            "account": "platform",
            "created": timestamp,
            "data": data,
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()


def _signature(payload: bytes, *, timestamp: int, secret: bytes = b"simulated-unit-secret") -> str:
    digest = hmac.new(
        secret,
        str(timestamp).encode() + b"." + payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def test_simulated_connector_verifies_its_own_test_event_identity() -> None:
    timestamp = int(time.time())
    payload = _payload(timestamp=timestamp)

    envelope = _connector().verify_webhook(
        payload=payload,
        signature=_signature(payload, timestamp=timestamp),
    )

    assert envelope.provider_event_id == "sim_evt_unit123"
    assert envelope.event_type == "checkout.session.outcome"
    assert envelope.provider_mode == "test"
    assert envelope.provider_account_id == "platform"
    assert int(envelope.signature_timestamp.timestamp()) == timestamp


def test_simulated_connector_rejects_invalid_and_expired_signatures() -> None:
    timestamp = int(time.time())
    payload = _payload(timestamp=timestamp)

    with pytest.raises(BadRequest) as invalid:
        _connector().verify_webhook(
            payload=payload,
            signature=_signature(payload, timestamp=timestamp, secret=b"wrong-secret"),
        )
    assert invalid.value.error == "BILLING_WEBHOOK_SIGNATURE_INVALID"

    expired_timestamp = timestamp - 301
    expired_payload = _payload(timestamp=expired_timestamp)
    with pytest.raises(BadRequest) as expired:
        _connector().verify_webhook(
            payload=expired_payload,
            signature=_signature(expired_payload, timestamp=expired_timestamp),
        )
    assert expired.value.error == "BILLING_WEBHOOK_SIGNATURE_EXPIRED"


def test_simulated_registration_accepts_checkout_and_subscription_lifecycle_events() -> None:
    project_root = Path(__file__).resolve().parents[5]
    plugin_path = project_root / "plugins" / "arclayer-simulated-billing" / "src" / "plugin.py"
    spec = importlib.util.spec_from_file_location("test_arclayer_simulated_billing_registration", plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load simulated billing Connector from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    registry = ExtensionManager(project_root).registry

    module.SimulatedBillingExtension().arclayer_register(registry)

    registration = registry.connectors.resolve("billing.simulated")
    assert registration is not None
    assert registration.definition.webhook_events == (
        "checkout.session.outcome",
        "subscription.lifecycle",
    )


@pytest.mark.asyncio
async def test_simulated_connector_creates_visible_pending_checkout_facts() -> None:
    connector = _connector()

    checkout = await connector.create_checkout_session(
        workspace_id="workspace",
        plan_code="premium",
        plan_id="plan",
        plan_revision_id="revision",
        external_price_id="sim_price",
        billing_cycle="monthly",
        currency="USD",
        success_url="https://app.example.test/success?billing=success",
        cancel_url="https://app.example.test/cancel",
        customer_id=None,
        idempotency_key="checkout-key",
    )

    assert checkout.external_session_id.startswith("sim_cs_")
    assert checkout.provider_account_id == "platform"
    assert "billingProvider=simulated" in checkout.url
    assert f"simulatedCheckout={checkout.external_session_id}" in checkout.url
    assert checkout.expires_at.timestamp() > time.time()


@pytest.mark.asyncio
async def test_simulated_connector_creates_deterministic_visible_top_up_checkout_facts() -> None:
    connector = _connector()
    offer_id = str(uuid4())
    kwargs = {
        "workspace_id": str(uuid4()),
        "top_up_offer_id": offer_id,
        "top_up_offer_revision": 4,
        "credit_amount": 2_000,
        "external_price_id": "sim_price_credits_2000",
        "currency": "USD",
        "amount_micros": 20_000_000,
        "success_url": "https://app.example.test/?billing=top-up-success",
        "cancel_url": "https://app.example.test/?billing=top-up-canceled",
        "customer_id": None,
        "idempotency_key": "arclayer:top-up-checkout:unit",
    }

    checkout = await connector.create_top_up_checkout_session(**kwargs)
    replay = await connector.create_top_up_checkout_session(**kwargs)

    assert checkout.external_session_id == replay.external_session_id
    assert checkout.external_session_id.startswith("sim_top_up_cs_")
    assert checkout.provider_account_id == "platform"
    assert checkout.url == replay.url
    assert "billingProvider=simulated" in checkout.url
    assert f"simulatedTopUpCheckout={checkout.external_session_id}" in checkout.url
    assert checkout.expires_at.timestamp() > time.time()


@pytest.mark.asyncio
async def test_simulated_connector_normalizes_checkout_outcome_without_subscription_effect() -> None:
    connector = _connector()

    with pytest.raises(ServiceUnavailable) as portal:
        await connector.create_portal_session(
            customer_id="customer",
            return_url="https://app.example.test",
            idempotency_key="portal-key",
        )
    assert portal.value.error == "BILLING_SIMULATOR_PORTAL_NOT_AVAILABLE"

    timestamp = int(time.time())
    payload = _payload(timestamp=timestamp)
    envelope = connector.verify_webhook(
        payload=payload,
        signature=_signature(payload, timestamp=timestamp),
    )
    outcome = await connector.checkout_outcome_from_event(payload=payload, envelope=envelope)
    subscription = await connector.subscription_from_event(payload=payload, envelope=envelope)

    assert outcome is not None
    assert outcome.event_id == envelope.provider_event_id
    assert outcome.outcome == "succeeded"
    assert outcome.expected_revision == 1
    assert subscription is None


@pytest.mark.asyncio
async def test_simulated_connector_normalizes_strict_subscription_lifecycle_facts() -> None:
    connector = _connector()
    timestamp = int(time.time())
    workspace_id = uuid4()
    plan_id = uuid4()
    plan_revision_id = uuid4()
    payload = _subscription_payload(
        timestamp=timestamp,
        workspace_id=str(workspace_id),
        plan_id=str(plan_id),
        plan_revision_id=str(plan_revision_id),
    )
    envelope = connector.verify_webhook(
        payload=payload,
        signature=_signature(payload, timestamp=timestamp),
    )

    checkout_outcome = await connector.checkout_outcome_from_event(payload=payload, envelope=envelope)
    subscription = await connector.subscription_from_event(payload=payload, envelope=envelope)

    assert checkout_outcome is None
    assert subscription is not None
    assert subscription.event_id == "sim_evt_subscription123"
    assert subscription.workspace_id == workspace_id
    assert subscription.plan_id == plan_id
    assert subscription.plan_revision_id == plan_revision_id
    assert subscription.external_price_id == "sim_price_premium_monthly"
    assert subscription.billing_cycle == "monthly"
    assert subscription.currency == "USD"
    assert subscription.customer_id == "sim_cus_unit123"
    assert subscription.subscription_id == "sim_sub_unit123"
    assert subscription.status == "active"
    assert int(subscription.current_period_start.timestamp()) == timestamp
    assert int(subscription.current_period_end.timestamp()) == timestamp + 2_592_000
    assert subscription.cancel_at_period_end is False
    assert subscription.dunning_event is None
    assert subscription.confirmed_transition is None
    assert subscription.checkout_activation is None


@pytest.mark.asyncio
async def test_simulated_connector_normalizes_checkout_activation_correlation() -> None:
    connector = _connector()
    timestamp = int(time.time())
    checkout_session_id = uuid4()
    payload = _subscription_payload(
        timestamp=timestamp,
        workspace_id=str(uuid4()),
        plan_id=str(uuid4()),
        plan_revision_id=str(uuid4()),
        checkout_activation={
            "checkout_session_id": str(checkout_session_id),
            "external_session_id": "sim_cs_activation123",
            "checkout_outcome_event_id": "sim_evt_checkoutactivation123",
        },
    )
    envelope = connector.verify_webhook(
        payload=payload,
        signature=_signature(payload, timestamp=timestamp),
    )

    subscription = await connector.subscription_from_event(payload=payload, envelope=envelope)

    assert subscription is not None
    assert subscription.checkout_activation is not None
    assert subscription.checkout_activation.checkout_session_id == checkout_session_id
    assert subscription.checkout_activation.external_session_id == "sim_cs_activation123"
    assert subscription.checkout_activation.checkout_outcome_event_id == "sim_evt_checkoutactivation123"
    assert int(subscription.checkout_activation.occurred_at.timestamp()) == timestamp


@pytest.mark.asyncio
async def test_simulated_connector_normalizes_invoice_and_transaction_projection() -> None:
    connector = _connector()
    timestamp = int(time.time())
    period_end = timestamp + 2_592_000
    payload = _subscription_payload(
        timestamp=timestamp,
        workspace_id=str(uuid4()),
        plan_id=str(uuid4()),
        plan_revision_id=str(uuid4()),
        payment={
            "amount_due_micros": 9_000_000,
            "amount_paid_micros": 9_000_000,
            "external_invoice_id": "sim_in_unit123",
            "hosted_invoice_url": "https://billing.example.test/invoices/sim_in_unit123",
            "issued_at": timestamp,
            "paid_at": timestamp,
            "period_end": period_end,
            "period_start": timestamp,
            "status": "paid",
            "transactions": [
                {
                    "amount_micros": 9_000_000,
                    "external_transaction_id": "sim_tx_unit123",
                    "kind": "renewal",
                    "occurred_at": timestamp,
                    "status": "succeeded",
                }
            ],
        },
    )
    envelope = connector.verify_webhook(
        payload=payload,
        signature=_signature(payload, timestamp=timestamp),
    )

    subscription = await connector.subscription_from_event(payload=payload, envelope=envelope)

    assert subscription is not None
    assert subscription.payment is not None
    assert subscription.payment.external_invoice_id == "sim_in_unit123"
    assert subscription.payment.status == "paid"
    assert subscription.payment.amount_due_micros == 9_000_000
    assert subscription.payment.amount_paid_micros == 9_000_000
    assert subscription.payment.period_end is not None
    assert int(subscription.payment.period_end.timestamp()) == period_end
    assert subscription.payment.hosted_invoice_url == "https://billing.example.test/invoices/sim_in_unit123"
    assert len(subscription.payment.transactions) == 1
    transaction = subscription.payment.transactions[0]
    assert transaction.external_transaction_id == "sim_tx_unit123"
    assert transaction.kind == "renewal"
    assert transaction.status == "succeeded"
    assert transaction.amount_micros == 9_000_000


@pytest.mark.asyncio
async def test_simulated_checkout_activation_rejects_invoice_period_mismatch() -> None:
    connector = _connector()
    timestamp = int(time.time())
    payload = _subscription_payload(
        timestamp=timestamp,
        workspace_id=str(uuid4()),
        plan_id=str(uuid4()),
        plan_revision_id=str(uuid4()),
        checkout_activation={
            "checkout_session_id": str(uuid4()),
            "external_session_id": "sim_cs_paymentperiod123",
            "checkout_outcome_event_id": "sim_evt_paymentperiod123",
        },
        payment={
            "amount_due_micros": 9_000_000,
            "amount_paid_micros": 9_000_000,
            "external_invoice_id": "sim_in_paymentperiod123",
            "issued_at": timestamp - 2_592_000,
            "paid_at": timestamp - 1,
            "period_end": timestamp,
            "period_start": timestamp - 2_592_000,
            "status": "paid",
            "transactions": [
                {
                    "amount_micros": 9_000_000,
                    "external_transaction_id": "sim_tx_paymentperiod123",
                    "kind": "subscription",
                    "occurred_at": timestamp - 1,
                    "status": "succeeded",
                }
            ],
        },
    )
    envelope = connector.verify_webhook(
        payload=payload,
        signature=_signature(payload, timestamp=timestamp),
    )

    with pytest.raises(BadRequest, match="BILLING_WEBHOOK_PAYLOAD_INVALID"):
        await connector.subscription_from_event(payload=payload, envelope=envelope)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "dunning", "expected_deadline"),
    (
        (
            "past_due",
            {
                "kind": "payment_failure",
                "provider_period_id": "sim_period_failure123",
                "recovery_deadline": 1,
            },
            True,
        ),
        (
            "canceled",
            {
                "kind": "final_unpaid",
                "provider_period_id": "sim_period_final123",
            },
            False,
        ),
        (
            "active",
            {
                "kind": "payment_recovered",
                "provider_period_id": "sim_period_recovered123",
            },
            False,
        ),
    ),
)
async def test_simulated_connector_normalizes_strict_dunning_facts(
    status: str,
    dunning: dict[str, object],
    expected_deadline: bool,
) -> None:
    connector = _connector()
    timestamp = int(time.time())
    if expected_deadline:
        dunning["recovery_deadline"] = timestamp + 86_400
    payload = _subscription_payload(
        timestamp=timestamp,
        workspace_id=str(uuid4()),
        plan_id=str(uuid4()),
        plan_revision_id=str(uuid4()),
        dunning=dunning,
        status=status,
    )
    envelope = connector.verify_webhook(
        payload=payload,
        signature=_signature(payload, timestamp=timestamp),
    )

    subscription = await connector.subscription_from_event(payload=payload, envelope=envelope)

    assert subscription is not None
    assert subscription.dunning_event is not None
    assert subscription.dunning_event.kind == dunning["kind"]
    assert subscription.dunning_event.provider_period_id == dunning["provider_period_id"]
    assert int(subscription.dunning_event.occurred_at.timestamp()) == timestamp
    if expected_deadline:
        assert subscription.dunning_event.recovery_deadline is not None
        assert int(subscription.dunning_event.recovery_deadline.timestamp()) == timestamp + 86_400
    else:
        assert subscription.dunning_event.recovery_deadline is None


@pytest.mark.asyncio
async def test_simulated_connector_rejects_inconsistent_dunning_metadata() -> None:
    connector = _connector()
    timestamp = int(time.time())
    missing_deadline = _subscription_payload(
        timestamp=timestamp,
        workspace_id=str(uuid4()),
        plan_id=str(uuid4()),
        plan_revision_id=str(uuid4()),
        dunning={
            "kind": "payment_failure",
            "provider_period_id": "sim_period_missingdeadline123",
        },
        status="past_due",
    )
    with pytest.raises(BadRequest, match="BILLING_WEBHOOK_PAYLOAD_INVALID"):
        connector.verify_webhook(
            payload=missing_deadline,
            signature=_signature(missing_deadline, timestamp=timestamp),
        )

    invalid_deadline = _subscription_payload(
        timestamp=timestamp,
        workspace_id=str(uuid4()),
        plan_id=str(uuid4()),
        plan_revision_id=str(uuid4()),
        dunning={
            "kind": "payment_failure",
            "provider_period_id": "sim_period_invaliddeadline123",
            "recovery_deadline": timestamp,
        },
        status="past_due",
    )
    envelope = connector.verify_webhook(
        payload=invalid_deadline,
        signature=_signature(invalid_deadline, timestamp=timestamp),
    )
    with pytest.raises(BadRequest, match="BILLING_WEBHOOK_PAYLOAD_INVALID"):
        await connector.subscription_from_event(payload=invalid_deadline, envelope=envelope)

    invalid_recovery = _subscription_payload(
        timestamp=timestamp,
        workspace_id=str(uuid4()),
        plan_id=str(uuid4()),
        plan_revision_id=str(uuid4()),
        dunning={
            "kind": "payment_recovered",
            "provider_period_id": "sim_period_invalidrecovery123",
        },
        status="past_due",
    )
    with pytest.raises(BadRequest, match="BILLING_WEBHOOK_PAYLOAD_INVALID"):
        connector.verify_webhook(
            payload=invalid_recovery,
            signature=_signature(invalid_recovery, timestamp=timestamp),
        )


@pytest.mark.asyncio
async def test_simulated_connector_rejects_event_type_and_data_shape_mismatch() -> None:
    connector = _connector()
    timestamp = int(time.time())
    body = json.loads(_payload(timestamp=timestamp))
    body["type"] = "subscription.lifecycle"
    payload = json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
    envelope = connector.verify_webhook(
        payload=payload,
        signature=_signature(payload, timestamp=timestamp),
    )

    with pytest.raises(BadRequest) as mismatch:
        await connector.subscription_from_event(payload=payload, envelope=envelope)

    assert mismatch.value.error == "BILLING_WEBHOOK_PAYLOAD_INVALID"
