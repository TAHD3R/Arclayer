from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
import time
from pathlib import Path
from typing import Any, cast

import pytest

from src.config import get_settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.extensions.manager import ExtensionManager
from src.modules.commerce.billing_connector import BillingConnector
from src.modules.commerce.billing_event_acceptance_service import build_billing_event_acceptance_service


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


def _payload(*, timestamp: int) -> bytes:
    return json.dumps(
        {
            "id": "sim_evt_unit123",
            "type": "simulated.foundation.probe",
            "mode": "test",
            "account": "platform",
            "created": timestamp,
            "data": {},
        },
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
    assert envelope.event_type == "simulated.foundation.probe"
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


@pytest.mark.asyncio
async def test_simulated_acceptance_resolves_its_connector_without_creating_an_effect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("BILLING__PROVIDER", "simulated")
    monkeypatch.setenv("BILLING__SIMULATED_SIGNING_SECRET", "simulated-unit-secret")
    get_settings.cache_clear()
    project_root = Path(__file__).resolve().parents[5]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-simulated-billing")
    await manager.register_all(app=None)
    timestamp = int(time.time())
    payload = _payload(timestamp=timestamp)

    result = await build_billing_event_acceptance_service(
        get_settings(),
        manager.registry.connectors,
        provider_name="simulated",
    ).accept(
        payload=payload,
        signature=_signature(payload, timestamp=timestamp),
    )

    assert result.accepted is False
    assert result.created is False
    assert result.inbox_id is None
    assert result.job_id is None


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
async def test_simulated_connector_keeps_portal_and_event_normalization_unavailable() -> None:
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
    with pytest.raises(ServiceUnavailable) as normalization:
        await connector.subscription_from_event(
            payload=payload,
            envelope=envelope,
        )
    assert normalization.value.error == "BILLING_SIMULATOR_EVENT_NORMALIZATION_NOT_AVAILABLE"
