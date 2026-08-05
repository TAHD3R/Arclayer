from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import SecretStr
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import APIError, BadRequest, Conflict, NotFound, ServiceUnavailable
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceCheckoutKind,
    CommerceCheckoutOutcome,
    CommerceCheckoutStatus,
)
from src.modules.commerce.billing_event_acceptance_service import BillingEventAcceptanceResult
from src.modules.commerce.simulated_checkout_outcome_service import (
    SimulatedCheckoutOutcomeService,
    SimulatedCheckoutOutcomeStore,
    SimulatedCheckoutOutcomeWrite,
)


class _TestService(SimulatedCheckoutOutcomeService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[BaseDBAsyncClient]:
        yield cast(BaseDBAsyncClient, object())


class _Store:
    def __init__(self, checkout: SimpleNamespace) -> None:
        self.checkout = checkout
        self.command: SimpleNamespace | None = None
        self.created = 0
        self.database_now = datetime.now(UTC)

    async def lock_idempotency_scope(self, **_kwargs: object) -> None:
        return None

    async def get_command_by_idempotency_key(self, **_kwargs: object):
        return self.command

    async def get_checkout_for_update(self, **_kwargs: object):
        return self.checkout

    async def create_command(self, **kwargs: object):
        self.created += 1
        self.command = SimpleNamespace(
            id=uuid4(),
            checkout_session_id=kwargs["checkout_session_id"],
            workspace_id=kwargs["workspace_id"],
            actor_user_id=kwargs["actor_user_id"],
            outcome=CommerceCheckoutOutcome(str(kwargs["outcome"])),
            expected_revision=kwargs["expected_revision"],
            idempotency_key=kwargs["idempotency_key"],
            request_fingerprint=kwargs["request_fingerprint"],
            provider_event_id=kwargs["provider_event_id"],
            event_created_at=kwargs["event_created_at"],
            accepted_inbox_id=None,
            accepted_job_id=None,
            revision=1,
        )
        return self.command

    async def save_acceptance(self, **kwargs: object) -> int:
        assert self.command is not None
        self.command.accepted_inbox_id = kwargs["inbox_id"]
        self.command.accepted_job_id = kwargs["job_id"]
        self.command.revision += 1
        return 1

    async def database_time(self, **_kwargs: object) -> datetime:
        return self.database_now


def _settings(*, app_env: str = "test", provider: str = "simulated") -> Settings:
    return cast(
        Settings,
        SimpleNamespace(
            app_env=app_env,
            billing=SimpleNamespace(
                provider=provider,
                simulated_signing_secret=SecretStr("simulated-signing-secret"),
            ),
        ),
    )


def _checkout() -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid4(),
        workspace_id=uuid4(),
        subscription_id=uuid4(),
        target_plan_revision_id=uuid4(),
        plan_code="premium",
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        kind=CommerceCheckoutKind.SUBSCRIPTION,
        status=CommerceCheckoutStatus.PENDING,
        external_session_id=f"sim_cs_{uuid4().hex}",
        external_price_id="sim_price_premium",
        request_fingerprint="a" * 64,
        expires_at=now + timedelta(minutes=30),
        revision=1,
    )


def _service(*, checkout: SimpleNamespace, acceptance: AsyncMock, store: _Store, settings: Settings | None = None):
    return _TestService(
        settings=settings or _settings(),
        acceptance=acceptance,
        store=cast(SimulatedCheckoutOutcomeStore, store),
    )


@pytest.mark.asyncio
async def test_outcome_command_replays_same_raw_event_with_fresh_signature_and_rejects_changed_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    checkout = _checkout()
    store = _Store(checkout)
    inbox_id = uuid4()
    job_id = uuid4()
    calls: list[tuple[bytes, str]] = []

    async def accept(*, payload: bytes, signature: str) -> BillingEventAcceptanceResult:
        calls.append((payload, signature))
        return BillingEventAcceptanceResult(
            accepted=True,
            inbox_id=inbox_id,
            job_id=job_id,
            created=len(calls) == 1,
        )

    acceptance = SimpleNamespace(accept=accept)
    audit = AsyncMock(return_value=SimpleNamespace(id=uuid4()))
    monkeypatch.setattr(
        "src.modules.commerce.simulated_checkout_outcome_service.write_required_activity_event",
        audit,
    )
    timestamps = iter((1_700_000_000, 1_700_000_001))
    monkeypatch.setattr("src.modules.commerce.simulated_checkout_outcome_service.time.time", lambda: next(timestamps))
    service = _service(
        checkout=checkout,
        acceptance=cast(AsyncMock, acceptance),
        store=store,
    )
    payload = SimulatedCheckoutOutcomeWrite(outcome="succeeded", expected_revision=1)

    first = await service.create(
        workspace_id=checkout.workspace_id,
        checkout_session_id=checkout.id,
        actor_user_id=uuid4(),
        idempotency_key="complete-checkout",
        payload=payload,
    )
    assert store.command is not None
    second = await service.create(
        workspace_id=checkout.workspace_id,
        checkout_session_id=checkout.id,
        actor_user_id=store.command.actor_user_id,
        idempotency_key="complete-checkout",
        payload=payload,
    )

    assert first.event_created is True
    assert second.event_created is False
    assert calls[0][0] == calls[1][0]
    assert calls[0][1] != calls[1][1]
    assert json.loads(calls[0][0])["data"]["plan_revision_id"] == str(checkout.target_plan_revision_id)
    assert store.created == 1
    audit.assert_awaited_once()

    with pytest.raises(Conflict) as captured:
        await service.create(
            workspace_id=checkout.workspace_id,
            checkout_session_id=checkout.id,
            actor_user_id=store.command.actor_user_id,
            idempotency_key="complete-checkout",
            payload=SimulatedCheckoutOutcomeWrite(outcome="failed", expected_revision=1),
        )
    assert captured.value.error == "BILLING_CHECKOUT_OUTCOME_IDEMPOTENCY_CONFLICT"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("settings", "key", "error"),
    [
        (_settings(app_env="production"), "key", "BILLING_SIMULATOR_PRODUCTION_FORBIDDEN"),
        (_settings(provider="stripe"), "key", "BILLING_SIMULATOR_NOT_CONFIGURED"),
        (_settings(), "   ", "BILLING_CHECKOUT_OUTCOME_IDEMPOTENCY_KEY_INVALID"),
    ],
)
async def test_outcome_command_requires_explicit_simulator_and_idempotency(
    settings: Settings,
    key: str,
    error: str,
) -> None:
    checkout = _checkout()
    store = _Store(checkout)
    service = _service(checkout=checkout, acceptance=AsyncMock(), store=store, settings=settings)

    with pytest.raises((BadRequest, ServiceUnavailable)) as captured:
        await service.create(
            workspace_id=checkout.workspace_id,
            checkout_session_id=checkout.id,
            actor_user_id=uuid4(),
            idempotency_key=key,
            payload=SimulatedCheckoutOutcomeWrite(outcome="pending", expected_revision=1),
        )
    assert captured.value.error == error


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("mutation", "error", "exception"),
    [
        (lambda row: setattr(row, "provider", "stripe"), "BILLING_SIMULATED_CHECKOUT_NOT_FOUND", NotFound),
        (
            lambda row: setattr(row, "status", CommerceCheckoutStatus.FAILED),
            "BILLING_CHECKOUT_OUTCOME_NOT_PENDING",
            Conflict,
        ),
        (lambda row: setattr(row, "expires_at", datetime.now(UTC)), "BILLING_CHECKOUT_OUTCOME_EXPIRED", Conflict),
        (lambda row: setattr(row, "revision", 2), "BILLING_CHECKOUT_OUTCOME_REVISION_STALE", Conflict),
    ],
)
async def test_outcome_command_rejects_invalid_checkout_state(mutation, error: str, exception: type[Exception]) -> None:
    checkout = _checkout()
    mutation(checkout)
    store = _Store(checkout)
    store.database_now = datetime.now(UTC) + timedelta(seconds=1)
    service = _service(checkout=checkout, acceptance=AsyncMock(), store=store)

    with pytest.raises(exception) as captured:
        await service.create(
            workspace_id=checkout.workspace_id,
            checkout_session_id=checkout.id,
            actor_user_id=uuid4(),
            idempotency_key="invalid-checkout",
            payload=SimulatedCheckoutOutcomeWrite(outcome="pending", expected_revision=1),
        )
    assert cast(APIError, captured.value).error == error


@pytest.mark.asyncio
async def test_outcome_command_fails_when_canonical_acceptance_does_not_persist_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    checkout = _checkout()
    store = _Store(checkout)
    acceptance = SimpleNamespace(accept=AsyncMock(return_value=BillingEventAcceptanceResult(accepted=False)))
    monkeypatch.setattr(
        "src.modules.commerce.simulated_checkout_outcome_service.write_required_activity_event",
        AsyncMock(return_value=SimpleNamespace(id=uuid4())),
    )
    service = _service(checkout=checkout, acceptance=cast(AsyncMock, acceptance), store=store)

    with pytest.raises(ServiceUnavailable) as captured:
        await service.create(
            workspace_id=checkout.workspace_id,
            checkout_session_id=checkout.id,
            actor_user_id=uuid4(),
            idempotency_key="acceptance-failed",
            payload=SimulatedCheckoutOutcomeWrite(outcome="pending", expected_revision=1),
        )
    assert captured.value.error == "BILLING_SIMULATOR_EVENT_NOT_ACCEPTED"
