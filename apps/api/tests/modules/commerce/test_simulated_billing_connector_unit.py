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
) -> bytes:
    return json.dumps(
        {
            "id": "sim_evt_subscription123",
            "type": "subscription.lifecycle",
            "mode": "test",
            "account": "platform",
            "created": timestamp,
            "data": {
                "billing_cycle": "monthly",
                "cancel_at_period_end": False,
                "currency": "USD",
                "current_period_end": timestamp + 2_592_000,
                "current_period_start": timestamp,
                "customer_id": "sim_cus_unit123",
                "external_price_id": "sim_price_premium_monthly",
                "plan_id": plan_id,
                "plan_revision_id": plan_revision_id,
                "status": "active",
                "subscription_id": "sim_sub_unit123",
                "workspace_id": workspace_id,
            },
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
