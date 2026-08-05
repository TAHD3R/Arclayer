from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Literal, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import APIError, BadRequest, Conflict, ServiceUnavailable
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import CommerceCheckoutOutcome, CommerceCheckoutStatus
from src.modules.commerce.billing_checkout_outcome_application_service import (
    BillingCheckoutOutcomeStore,
    BillingProviderCheckoutOutcomeApplicationService,
)
from src.modules.commerce.billing_connector import ProviderCheckoutOutcome
from src.modules.commerce.billing_provider_application_service import VerifiedBillingProviderEvent


class _TestService(BillingProviderCheckoutOutcomeApplicationService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[BaseDBAsyncClient]:
        yield cast(BaseDBAsyncClient, object())


class _Store:
    def __init__(self, command: SimpleNamespace, checkout: SimpleNamespace) -> None:
        self.command = command
        self.checkout = checkout
        self.saved: dict[str, object] | None = None

    async def get_command_by_event_id(self, **_kwargs: object):
        return self.command

    async def get_checkout_for_update(self, **_kwargs: object):
        return self.checkout

    async def save_applied_outcome(self, **kwargs: object) -> tuple[int, int]:
        self.saved = kwargs
        if kwargs["checkout_changed"]:
            self.checkout.status = CommerceCheckoutStatus(str(kwargs["result_status"]))
            self.checkout.revision = kwargs["result_revision"]
            self.checkout.completed_at = kwargs["completed_at"]
        self.command.processed_at = kwargs["processed_at"]
        self.command.result_status = CommerceCheckoutStatus(str(kwargs["result_status"]))
        self.command.result_revision = kwargs["result_revision"]
        return (1 if kwargs["checkout_changed"] else 0, 1)

    async def database_time(self, **_kwargs: object) -> datetime:
        return datetime.now(UTC)


def _facts(
    *, requested_outcome: Literal["pending", "succeeded", "failed", "canceled"] = "succeeded"
) -> tuple[SimpleNamespace, SimpleNamespace, ProviderCheckoutOutcome]:
    occurred_at = datetime.now(UTC)
    command = SimpleNamespace(
        id=uuid4(),
        checkout_session_id=uuid4(),
        workspace_id=uuid4(),
        actor_user_id=uuid4(),
        outcome=CommerceCheckoutOutcome(requested_outcome),
        expected_revision=1,
        event_created_at=occurred_at,
        idempotency_key="arclayer:checkout-outcome:" + "b" * 64,
        provider_event_id="sim_evt_test",
        processed_at=None,
        result_status=None,
        result_revision=None,
        revision=2,
    )
    checkout = SimpleNamespace(
        id=command.checkout_session_id,
        workspace_id=command.workspace_id,
        external_session_id="sim_cs_test",
        plan_code="premium",
        target_plan_revision_id=uuid4(),
        external_price_id="sim_price_premium",
        request_fingerprint="a" * 64,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        status=CommerceCheckoutStatus.PENDING,
        revision=1,
        expires_at=occurred_at + timedelta(minutes=30),
        completed_at=None,
    )
    outcome = ProviderCheckoutOutcome(
        event_id=command.provider_event_id,
        checkout_session_id=checkout.id,
        external_session_id=checkout.external_session_id,
        workspace_id=checkout.workspace_id,
        actor_user_id=command.actor_user_id,
        plan_code=checkout.plan_code,
        plan_revision_id=checkout.target_plan_revision_id,
        external_price_id=checkout.external_price_id,
        checkout_request_fingerprint=checkout.request_fingerprint,
        command_idempotency_key_hash="b" * 64,
        expected_revision=1,
        outcome=requested_outcome,
        occurred_at=occurred_at,
    )
    return command, checkout, outcome


def _service(store: _Store) -> _TestService:
    return _TestService(
        settings=cast(Settings, SimpleNamespace()),
        store=cast(BillingCheckoutOutcomeStore, store),
    )


def _verified(outcome: ProviderCheckoutOutcome) -> VerifiedBillingProviderEvent:
    return VerifiedBillingProviderEvent(
        provider_event_id=outcome.event_id,
        payload_sha256="c" * 64,
        signature_reference="billing-webhook:test",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("requested", "status", "revision", "changed"),
    [
        ("pending", CommerceCheckoutStatus.PENDING, 1, False),
        ("succeeded", CommerceCheckoutStatus.COMPLETED, 2, True),
        ("failed", CommerceCheckoutStatus.FAILED, 2, True),
        ("canceled", CommerceCheckoutStatus.CANCELED, 2, True),
    ],
)
async def test_checkout_outcome_applies_exact_state_machine(
    monkeypatch: pytest.MonkeyPatch,
    requested: Literal["pending", "succeeded", "failed", "canceled"],
    status: CommerceCheckoutStatus,
    revision: int,
    changed: bool,
) -> None:
    command, checkout, outcome = _facts(requested_outcome=requested)
    store = _Store(command, checkout)
    audit = AsyncMock(return_value=SimpleNamespace(id=uuid4()))
    monkeypatch.setattr(
        "src.modules.commerce.billing_checkout_outcome_application_service.write_required_activity_event",
        audit,
    )

    result = await _service(store).apply_provider_checkout_outcome(
        outcome=outcome,
        provider="simulated",
        provider_mode="test",
        provider_account_id="platform",
        verified_event=_verified(outcome),
    )

    assert result.status == status
    assert result.revision == revision
    assert result.changed is changed
    assert checkout.status == status
    assert checkout.revision == revision
    assert checkout.completed_at == (outcome.occurred_at if changed else None)
    audit.assert_awaited_once()


@pytest.mark.asyncio
async def test_checkout_outcome_replays_processed_receipt_without_second_write_or_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    command, checkout, outcome = _facts()
    command.processed_at = datetime.now(UTC)
    command.result_status = CommerceCheckoutStatus.COMPLETED
    command.result_revision = 2
    checkout.status = CommerceCheckoutStatus.COMPLETED
    checkout.revision = 2
    store = _Store(command, checkout)
    audit = AsyncMock()
    monkeypatch.setattr(
        "src.modules.commerce.billing_checkout_outcome_application_service.write_required_activity_event",
        audit,
    )

    result = await _service(store).apply_provider_checkout_outcome(
        outcome=outcome,
        provider="simulated",
        provider_mode="test",
        provider_account_id="platform",
        verified_event=_verified(outcome),
    )

    assert result.status == CommerceCheckoutStatus.COMPLETED
    assert result.changed is True
    assert store.saved is None
    audit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("mutation", "exception", "error"),
    [
        (
            lambda command, checkout, outcome: object.__setattr__(outcome, "event_id", "other"),
            BadRequest,
            "BILLING_CHECKOUT_OUTCOME_EVIDENCE_INVALID",
        ),
        (
            lambda command, checkout, outcome: setattr(checkout, "request_fingerprint", "d" * 64),
            BadRequest,
            "BILLING_CHECKOUT_OUTCOME_EVIDENCE_INVALID",
        ),
        (
            lambda command, checkout, outcome: setattr(checkout, "status", CommerceCheckoutStatus.FAILED),
            Conflict,
            "BILLING_CHECKOUT_OUTCOME_REVISION_STALE",
        ),
        (
            lambda command, checkout, outcome: (
                object.__setattr__(outcome, "occurred_at", checkout.expires_at + timedelta(seconds=1)),
                setattr(command, "event_created_at", outcome.occurred_at),
            ),
            Conflict,
            "BILLING_CHECKOUT_OUTCOME_EXPIRED",
        ),
    ],
)
async def test_checkout_outcome_rejects_invalid_evidence_or_order(
    mutation, exception: type[Exception], error: str
) -> None:
    command, checkout, outcome = _facts()
    mutation(command, checkout, outcome)
    store = _Store(command, checkout)

    with pytest.raises(exception) as captured:
        await _service(store).apply_provider_checkout_outcome(
            outcome=outcome,
            provider="simulated",
            provider_mode="test",
            provider_account_id="platform",
            verified_event=_verified(outcome),
        )
    assert cast(APIError, captured.value).error == error


@pytest.mark.asyncio
async def test_checkout_outcome_rejects_corrupt_processed_receipt() -> None:
    command, checkout, outcome = _facts()
    command.processed_at = datetime.now(UTC)
    store = _Store(command, checkout)

    with pytest.raises(ServiceUnavailable) as captured:
        await _service(store).apply_provider_checkout_outcome(
            outcome=outcome,
            provider="simulated",
            provider_mode="test",
            provider_account_id="platform",
            verified_event=_verified(outcome),
        )
    assert captured.value.error == "BILLING_CHECKOUT_OUTCOME_EVIDENCE_INVALID"
