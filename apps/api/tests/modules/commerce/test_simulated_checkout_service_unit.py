from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.models.commerce.billing import BillingCycle, BillingProviderMode
from src.models.commerce.payments import CommerceCheckoutStatus
from src.modules.commerce.billing_connector import BillingConnector, CheckoutSession
from src.modules.commerce.checkout_session_repository import CheckoutSessionRecord
from src.modules.commerce.simulated_checkout_service import (
    SimulatedCheckoutRequest,
    SimulatedCheckoutService,
    SimulatedCheckoutStore,
)


class _TestSimulatedCheckoutService(SimulatedCheckoutService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[BaseDBAsyncClient]:
        yield cast(BaseDBAsyncClient, object())


def _request() -> SimulatedCheckoutRequest:
    return SimulatedCheckoutRequest(
        workspace_id=uuid4(),
        actor_user_id=uuid4(),
        subscription_id=uuid4(),
        plan_code="premium",
        plan_id=uuid4(),
        plan_revision_id=uuid4(),
        external_price_id="sim_price_premium_monthly",
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=99_000_000,
        provider_idempotency_key="arclayer:checkout:" + "a" * 64,
        request_fingerprint="b" * 64,
        success_url="https://app.example.test/?billing=success",
        cancel_url="https://app.example.test/?billing=canceled",
    )


def _record(request: SimulatedCheckoutRequest) -> CheckoutSessionRecord:
    return CheckoutSessionRecord(
        id=uuid4(),
        workspace_id=request.workspace_id,
        subscription_id=request.subscription_id,
        target_plan_revision_id=request.plan_revision_id,
        plan_code=request.plan_code,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        status=CommerceCheckoutStatus.PENDING,
        billing_cycle=request.billing_cycle,
        currency=request.currency,
        amount_micros=request.amount_micros,
        external_price_id=request.external_price_id,
        external_session_id="sim_cs_unit",
        checkout_url="https://app.example.test/?billingProvider=simulated",
        idempotency_key=request.provider_idempotency_key,
        request_fingerprint=request.request_fingerprint,
        actor_user_id=request.actor_user_id,
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
        revision=1,
    )


@pytest.mark.asyncio
async def test_simulated_checkout_service_persists_provider_facts_after_scope_lock() -> None:
    request = _request()
    record = _record(request)
    provider_session = CheckoutSession(
        url=record.checkout_url,
        external_session_id=record.external_session_id,
        provider_account_id=record.provider_account_id,
        expires_at=record.expires_at,
    )
    provider = SimpleNamespace(
        provider_mode="test",
        create_checkout_session=AsyncMock(return_value=provider_session),
    )
    repository = SimpleNamespace(
        lock_idempotency_scope=AsyncMock(),
        require_replay=AsyncMock(return_value=None),
        create_simulated_checkout=AsyncMock(return_value=record),
    )
    service = _TestSimulatedCheckoutService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        repository=cast(SimulatedCheckoutStore, repository),
    )

    result = await service.create(request=request)

    assert result.url == record.checkout_url
    repository.lock_idempotency_scope.assert_awaited_once()
    repository.require_replay.assert_awaited_once()
    provider.create_checkout_session.assert_awaited_once_with(
        workspace_id=str(request.workspace_id),
        plan_code="premium",
        plan_id=str(request.plan_id),
        plan_revision_id=str(request.plan_revision_id),
        external_price_id="sim_price_premium_monthly",
        billing_cycle="monthly",
        currency="USD",
        success_url=request.success_url,
        cancel_url=request.cancel_url,
        customer_id=None,
        idempotency_key=request.provider_idempotency_key,
    )
    command = repository.create_simulated_checkout.await_args.kwargs["command"]
    assert command.external_session_id == "sim_cs_unit"
    assert command.provider_account_id == "platform"
    assert command.amount_micros == 99_000_000
    assert command.request_fingerprint == "b" * 64


@pytest.mark.asyncio
async def test_simulated_checkout_service_replays_without_provider_or_duplicate_persistence() -> None:
    request = _request()
    record = _record(request)
    provider = SimpleNamespace(provider_mode="test", create_checkout_session=AsyncMock())
    repository = SimpleNamespace(
        lock_idempotency_scope=AsyncMock(),
        require_replay=AsyncMock(return_value=record),
        create_simulated_checkout=AsyncMock(),
    )
    service = _TestSimulatedCheckoutService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        repository=cast(SimulatedCheckoutStore, repository),
    )

    result = await service.create(request=request)

    assert result.url == record.checkout_url
    provider.create_checkout_session.assert_not_awaited()
    repository.create_simulated_checkout.assert_not_awaited()
