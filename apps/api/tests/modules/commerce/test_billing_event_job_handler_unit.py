from __future__ import annotations

import copy
import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import Settings, get_settings
from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel
from src.core.exceptions import ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    ConnectorEventInbox,
    ConnectorEventInboxStatus,
    SubscriptionStatus,
)
from src.modules.commerce.billing_connector import (
    BillingConnector,
    BillingWebhookEnvelope,
    CheckoutSession,
    ProviderSubscription,
)
from src.modules.commerce.billing_event_crypto import billing_event_aad, encrypt_billing_event_payload
from src.modules.commerce.billing_event_job_contract import (
    BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE_CODE,
    BILLING_CONNECTOR_VERSION_UNAVAILABLE_CODE,
    BillingConnectorEventJobInput,
    BillingConnectorEventJobTarget,
)
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.commerce.service import CommerceService
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext
from src.settings.crypto import ensure_master_key


class _Connector:
    def __init__(self, subscription: ProviderSubscription | Exception) -> None:
        self.subscription = subscription

    async def create_checkout_session(self, **_kwargs: Any) -> CheckoutSession:
        raise AssertionError("checkout must not run in a webhook worker")

    async def create_portal_session(self, **_kwargs: Any) -> CheckoutSession:
        raise AssertionError("portal must not run in a webhook worker")

    def verify_webhook(self, **_kwargs: Any) -> BillingWebhookEnvelope:
        raise AssertionError("worker must not repeat timestamp-based signature verification")

    async def subscription_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderSubscription | None:
        _ = payload, envelope
        if isinstance(self.subscription, Exception):
            raise self.subscription
        return self.subscription


def _settings(tmp_path: Path) -> Settings:
    settings = get_settings()
    key_path = tmp_path / "billing-handler.key"
    ensure_master_key(key_path)
    return settings.model_copy(update={"security": settings.security.model_copy(update={"master_key_path": key_path})})


def _subscription(*, event_id: str) -> ProviderSubscription:
    period_start = datetime.now(UTC).replace(microsecond=0)
    return ProviderSubscription(
        event_id=event_id,
        workspace_id=uuid4(),
        plan_code="premium",
        billing_cycle=BillingCycle.MONTHLY,
        customer_id="cus_worker",
        subscription_id="sub_worker",
        status=SubscriptionStatus.ACTIVE,
        current_period_start=period_start,
        current_period_end=period_start + timedelta(days=30),
        cancel_at_period_end=False,
    )


def _inbox(*, settings: Settings, payload: bytes) -> ConnectorEventInbox:
    payload_hash = hashlib.sha256(payload).hexdigest()
    event_id = "evt_worker123"
    encrypted_payload = encrypt_billing_event_payload(
        payload,
        key_path=settings.security.master_key_path,
        aad=billing_event_aad(
            provider="stripe",
            provider_mode="test",
            provider_account_id="platform",
            provider_event_id=event_id,
            connector_key="billing.stripe",
            connector_version="1.0.0",
            payload_sha256=payload_hash,
        ),
    )
    return ConnectorEventInbox(
        id=uuid4(),
        provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        provider_event_id=event_id,
        connector_key="billing.stripe",
        connector_version="1.0.0",
        event_type="customer.subscription.updated",
        signature_timestamp=datetime.now(UTC),
        payload_sha256=payload_hash,
        encrypted_payload=encrypted_payload,
        retention_deadline=datetime.now(UTC) + timedelta(days=30),
        status=ConnectorEventInboxStatus.RECEIVED,
        processing_attempts=0,
    )


def _registry(connector: BillingConnector | None) -> ConnectorRegistry:
    registry = ConnectorRegistry()
    if connector is not None:
        registry.register(
            extension="arclayer-stripe",
            definition=ConnectorDefinition(
                key="billing.stripe",
                kind=ConnectorKind.BILLING,
                version="1.0.0",
                trust_level=ConnectorTrustLevel.OFFICIAL,
            ),
            factory=lambda: connector,
        )
    return registry


def _context(
    inbox: ConnectorEventInbox,
) -> JobExecutionContext[BillingConnectorEventJobTarget, BillingConnectorEventJobInput]:
    async def run(operation):  # type: ignore[no-untyped-def]
        return await operation()

    return cast(
        JobExecutionContext[BillingConnectorEventJobTarget, BillingConnectorEventJobInput],
        SimpleNamespace(
            target=BillingConnectorEventJobTarget(inbox_id=inbox.id),
            input_reference=BillingConnectorEventJobInput(
                inbox_id=inbox.id,
                connector_key=inbox.connector_key,
                connector_version=inbox.connector_version,
                payload_sha256=inbox.payload_sha256,
            ),
            report_progress=AsyncMock(),
            checkpoint=AsyncMock(),
            run_fenced_domain_commit=AsyncMock(side_effect=run),
        ),
    )


def _repository(inbox: ConnectorEventInbox) -> BillingEventInboxRepository:
    state = {"current": inbox}

    async def current(**_kwargs):  # type: ignore[no-untyped-def]
        return state["current"]

    repository = SimpleNamespace(
        get_by_id=AsyncMock(side_effect=current),
        begin_processing=AsyncMock(side_effect=current),
        record_failure=AsyncMock(),
    )

    async def mark_processed(**kwargs):  # type: ignore[no-untyped-def]
        processed = copy.copy(state["current"])
        processed.status = ConnectorEventInboxStatus.PROCESSED
        processed.result_reference = kwargs["result_reference"]
        state["current"] = processed
        return processed

    repository.mark_processed = AsyncMock(side_effect=mark_processed)
    return cast(BillingEventInboxRepository, repository)


@pytest.mark.asyncio
async def test_worker_replay_does_not_apply_subscription_effect_twice(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    payload = b'{"id":"evt_worker123"}'
    inbox = _inbox(settings=settings, payload=payload)
    subscription = _subscription(event_id=inbox.provider_event_id)
    connector = cast(BillingConnector, _Connector(subscription))
    repository = _repository(inbox)
    commerce = cast(CommerceService, SimpleNamespace(apply_provider_subscription=AsyncMock()))
    handler = BillingConnectorEventJobHandler(
        settings=settings,
        connectors=_registry(connector),
        repository=repository,
        commerce=commerce,
    )
    context = _context(inbox)

    first = await handler.execute(context=context)
    second = await handler.execute(context=context)
    reconciled = await handler.reconcile(context=context)

    assert first == second == reconciled
    assert first.applied is True
    cast(AsyncMock, commerce.apply_provider_subscription).assert_awaited_once()
    cast(AsyncMock, repository.mark_processed).assert_awaited_once()


@pytest.mark.asyncio
async def test_worker_fails_explicitly_when_pinned_connector_version_is_unavailable(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    inbox = _inbox(settings=settings, payload=b"{}")
    handler = BillingConnectorEventJobHandler(
        settings=settings,
        connectors=_registry(None),
        repository=_repository(inbox),
    )

    with pytest.raises(PermanentJobExecutionError) as captured:
        await handler.execute(context=_context(inbox))

    assert captured.value.code == BILLING_CONNECTOR_VERSION_UNAVAILABLE_CODE


@pytest.mark.asyncio
async def test_worker_classifies_provider_unavailability_as_retryable(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    inbox = _inbox(settings=settings, payload=b"{}")
    connector = cast(BillingConnector, _Connector(ServiceUnavailable(error="BILLING_PROVIDER_REQUEST_FAILED")))
    handler = BillingConnectorEventJobHandler(
        settings=settings,
        connectors=_registry(connector),
        repository=_repository(inbox),
    )

    with pytest.raises(TransientJobExecutionError) as captured:
        await handler.execute(context=_context(inbox))

    assert captured.value.code == BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE_CODE
