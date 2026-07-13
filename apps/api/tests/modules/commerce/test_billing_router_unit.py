from __future__ import annotations

import hashlib
import hmac
import json
import time
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.registry import create_app
from src.modules.commerce.service import CommerceService
from tests.utils.asgi_client import asgi_client


def _configure_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, *, provider: str = "stripe") -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOGGING__LOG_DIR", str(tmp_path))
    monkeypatch.setenv("LOGGING__ASYNC_ENABLED", "0")
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("TEST_DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    monkeypatch.setenv("TEST_VALKEY__ENABLED", "0")
    monkeypatch.setenv("TASKIQ__ENABLED", "0")
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__CSRF__ENABLED", "1")
    monkeypatch.setenv("SECURITY__ENABLE_REDIS", "0")
    monkeypatch.setenv("BILLING__PROVIDER", provider)
    monkeypatch.setenv("BILLING__STRIPE_SECRET_KEY", "sk_test_router")
    monkeypatch.setenv("BILLING__STRIPE_WEBHOOK_SECRET", "whsec_router")
    get_settings.cache_clear()


def _event_payload() -> bytes:
    workspace_id = str(uuid4())
    event = {
        "id": "evt_router123",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_router",
                "customer": "cus_router",
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
        },
    }
    return json.dumps(event, separators=(",", ":")).encode()


def _signature(payload: bytes, *, secret: str = "whsec_router") -> str:
    timestamp = int(time.time())
    digest = hmac.new(
        secret.encode(),
        str(timestamp).encode() + b"." + payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


@pytest.mark.asyncio
async def test_signed_stripe_webhook_bypasses_browser_csrf_and_reaches_commerce_service(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_env(monkeypatch, tmp_path)
    payload = _event_payload()
    apply_subscription = AsyncMock()

    with patch.object(CommerceService, "apply_provider_subscription", new=apply_subscription):
        async with asgi_client(create_app()) as client:
            response = await client.post(
                "/api/v1/commerce/webhooks/stripe",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "Stripe-Signature": _signature(payload),
                },
            )

    assert response.status_code == 200
    assert response.json()["data"] is None
    apply_subscription.assert_awaited_once()


@pytest.mark.asyncio
async def test_stripe_webhook_rejects_invalid_signature_before_subscription_mutation(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_env(monkeypatch, tmp_path)
    payload = _event_payload()
    apply_subscription = AsyncMock()

    with patch.object(CommerceService, "apply_provider_subscription", new=apply_subscription):
        async with asgi_client(create_app()) as client:
            response = await client.post(
                "/api/v1/commerce/webhooks/stripe",
                content=payload,
                headers={"Content-Type": "application/json", "Stripe-Signature": "t=1,v1=invalid"},
            )

    assert response.status_code == 400
    assert response.json()["error"] == "BILLING_WEBHOOK_SIGNATURE_EXPIRED"
    apply_subscription.assert_not_awaited()


@pytest.mark.asyncio
async def test_stripe_webhook_reports_provider_not_configured(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _configure_env(monkeypatch, tmp_path, provider="disabled")
    payload = _event_payload()

    async with asgi_client(create_app()) as client:
        response = await client.post(
            "/api/v1/commerce/webhooks/stripe",
            content=payload,
            headers={"Content-Type": "application/json", "Stripe-Signature": _signature(payload)},
        )

    assert response.status_code == 503
    assert response.json()["error"] == "BILLING_PROVIDER_NOT_CONFIGURED"
