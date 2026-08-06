from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import CommerceCheckoutStatus
from src.modules.commerce.billing_connector import (
    BillingConnector,
    CheckoutSession,
    build_billing_operation_idempotency_key,
)
from src.modules.commerce.schema import TopUpCheckoutSessionCreate
from src.modules.commerce.top_up_checkout_repository import (
    TopUpCheckoutCreate,
    TopUpCheckoutSelection,
    TopUpCheckoutSessionRecord,
)
from src.modules.commerce.top_up_checkout_service import TopUpCheckoutService, TopUpCheckoutStore


class _TestTopUpCheckoutService(TopUpCheckoutService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[BaseDBAsyncClient]:
        yield cast(BaseDBAsyncClient, object())


def _selection() -> TopUpCheckoutSelection:
    return TopUpCheckoutSelection(
        top_up_offer_id=uuid4(),
        top_up_offer_revision=4,
        credit_amount=2_000,
        currency="USD",
        amount_micros=20_000_000,
        external_price_id="sim_price_credits_2000",
        customer_id="sim_cus_workspace",
    )


def _record(
    *,
    workspace_id: UUID,
    actor_user_id: UUID,
    selection: TopUpCheckoutSelection,
    idempotency_key: str,
    fingerprint: str,
    session: CheckoutSession,
) -> TopUpCheckoutSessionRecord:
    return TopUpCheckoutSessionRecord(
        id=uuid4(),
        workspace_id=workspace_id,
        top_up_offer_id=selection.top_up_offer_id,
        top_up_offer_revision=selection.top_up_offer_revision,
        credit_amount=selection.credit_amount,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id=session.provider_account_id,
        status=CommerceCheckoutStatus.PENDING,
        currency=selection.currency,
        amount_micros=selection.amount_micros,
        external_price_id=selection.external_price_id,
        external_session_id=session.external_session_id,
        checkout_url=session.url,
        idempotency_key=idempotency_key,
        request_fingerprint=fingerprint,
        actor_user_id=actor_user_id,
        expires_at=session.expires_at,
        revision=1,
    )


@pytest.mark.asyncio
async def test_top_up_checkout_service_pins_selection_and_persists_only_pending_checkout() -> None:
    workspace_id = uuid4()
    actor_user_id = uuid4()
    selection = _selection()
    session = CheckoutSession(
        url="https://app.example.test/?billing=top-up-success&billingProvider=simulated",
        external_session_id="sim_top_up_cs_unit",
        provider_account_id="platform",
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
    )
    provider = SimpleNamespace(
        provider_mode="test",
        create_top_up_checkout_session=AsyncMock(return_value=session),
    )
    repository = SimpleNamespace(
        lock_idempotency_scope=AsyncMock(),
        require_replay=AsyncMock(return_value=None),
        get_checkout_selection=AsyncMock(return_value=selection),
        create_top_up_checkout=AsyncMock(),
    )
    service = _TestTopUpCheckoutService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        provider_name="simulated",
        repository=cast(TopUpCheckoutStore, repository),
    )
    provider_key = build_billing_operation_idempotency_key(
        operation="top-up-checkout",
        business_identity=(str(workspace_id), str(actor_user_id), "top-up-attempt"),
    )
    payload = TopUpCheckoutSessionCreate(top_up_offer_id=selection.top_up_offer_id)

    async def persist(**kwargs: object) -> TopUpCheckoutSessionRecord:
        command = cast(TopUpCheckoutCreate, kwargs["command"])
        return _record(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            selection=selection,
            idempotency_key=provider_key,
            fingerprint=command.request_fingerprint,
            session=session,
        )

    repository.create_top_up_checkout.side_effect = persist
    result = await service.create(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        idempotency_key=" top-up-attempt ",
        payload=payload,
    )

    assert result.url == session.url
    repository.lock_idempotency_scope.assert_awaited_once()
    replay_call = repository.require_replay.await_args.kwargs
    assert replay_call["idempotency_key"] == provider_key
    assert len(replay_call["request_fingerprint"]) == 64
    repository.get_checkout_selection.assert_awaited_once_with(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        top_up_offer_id=selection.top_up_offer_id,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        conn=replay_call["conn"],
    )
    provider.create_top_up_checkout_session.assert_awaited_once_with(
        workspace_id=str(workspace_id),
        top_up_offer_id=str(selection.top_up_offer_id),
        top_up_offer_revision=4,
        credit_amount=2_000,
        external_price_id="sim_price_credits_2000",
        currency="USD",
        amount_micros=20_000_000,
        success_url="https://app.arclayer.localhost/?billing=top-up-success",
        cancel_url="https://app.arclayer.localhost/?billing=top-up-canceled",
        customer_id="sim_cus_workspace",
        idempotency_key=provider_key,
    )
    command = repository.create_top_up_checkout.await_args.kwargs["command"]
    assert command.top_up_offer_revision == 4
    assert command.credit_amount == 2_000
    assert command.request_fingerprint == replay_call["request_fingerprint"]


@pytest.mark.asyncio
async def test_top_up_checkout_service_exact_replay_skips_mutable_catalog_and_provider() -> None:
    workspace_id = uuid4()
    actor_user_id = uuid4()
    selection = _selection()
    session = CheckoutSession(
        url="https://app.example.test/?billingProvider=simulated",
        external_session_id="sim_top_up_cs_replay",
        provider_account_id="platform",
        expires_at=datetime.now(UTC) + timedelta(minutes=30),
    )
    stored_record = _record(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        selection=selection,
        idempotency_key="arclayer:top-up-checkout:replay",
        fingerprint="f" * 64,
        session=session,
    )
    provider = SimpleNamespace(provider_mode="test", create_top_up_checkout_session=AsyncMock())
    repository = SimpleNamespace(
        lock_idempotency_scope=AsyncMock(),
        require_replay=AsyncMock(),
        get_checkout_selection=AsyncMock(),
        create_top_up_checkout=AsyncMock(),
    )
    service = _TestTopUpCheckoutService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        provider_name="simulated",
        repository=cast(TopUpCheckoutStore, repository),
    )

    async def replay(**kwargs: object) -> TopUpCheckoutSessionRecord:
        return stored_record.model_copy(update={"request_fingerprint": cast(str, kwargs["request_fingerprint"])})

    repository.require_replay.side_effect = replay

    result = await service.create(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        idempotency_key="replay",
        payload=TopUpCheckoutSessionCreate(top_up_offer_id=selection.top_up_offer_id),
    )

    assert result.url == stored_record.checkout_url
    repository.get_checkout_selection.assert_not_awaited()
    provider.create_top_up_checkout_session.assert_not_awaited()
    repository.create_top_up_checkout.assert_not_awaited()
