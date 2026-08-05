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
from src.core.exceptions import BadRequest, Conflict, ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    SubscriptionStatus,
    WorkspaceCreditAccount,
)
from src.models.commerce.payments import CommerceCheckoutStatus
from src.models.connectors.inbox import ConnectorEventInbox, ConnectorEventInboxStatus
from src.modules.commerce.billing_checkout_outcome_application_service import (
    BillingCheckoutOutcomeApplicationResult,
    BillingProviderCheckoutOutcomeApplicator,
)
from src.modules.commerce.billing_connector import (
    BillingConnector,
    BillingWebhookEnvelope,
    CheckoutSession,
    ProviderCheckoutOutcome,
    ProviderSubscription,
)
from src.modules.commerce.billing_event_crypto import billing_event_aad, encrypt_billing_event_payload
from src.modules.commerce.billing_event_job_contract import (
    BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE,
    BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE_CODE,
    BILLING_CONNECTOR_VERSION_UNAVAILABLE_CODE,
    BillingConnectorEventJobInput,
    BillingConnectorEventJobTarget,
)
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.commerce.billing_provider_application_service import (
    BillingProviderSubscriptionApplicationService,
    BillingProviderSubscriptionApplicator,
)
from src.modules.commerce.convergence.schema import ProviderConfirmedConvergenceApplication
from src.modules.commerce.subscription_transitions.schema import ProviderConfirmedTransitionEvidence
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext
from src.settings.crypto import ensure_master_key


class _Connector:
    def __init__(
        self,
        subscription: ProviderSubscription | Exception | None,
        *,
        checkout_outcome: ProviderCheckoutOutcome | None = None,
    ) -> None:
        self.subscription = subscription
        self.checkout_outcome = checkout_outcome

    @property
    def provider_mode(self) -> str:
        return "test"

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

    async def checkout_outcome_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderCheckoutOutcome | None:
        _ = payload, envelope
        return self.checkout_outcome


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
        plan_id=uuid4(),
        plan_revision_id=uuid4(),
        external_price_id="price_worker",
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
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
        provider_mode=BillingProviderMode.TEST.value,
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
    applicator = cast(BillingProviderSubscriptionApplicator, SimpleNamespace(apply_provider_subscription=AsyncMock()))
    handler = BillingConnectorEventJobHandler(
        settings=settings,
        connectors=_registry(connector),
        repository=repository,
        applicator=applicator,
    )
    context = _context(inbox)

    first = await handler.execute(context=context)
    second = await handler.execute(context=context)
    reconciled = await handler.reconcile(context=context)

    assert first == second == reconciled
    assert first.applied is True
    call = cast(AsyncMock, applicator.apply_provider_subscription).await_args
    assert call is not None
    assert call.kwargs["subscription"] == subscription
    assert call.kwargs["provider"] == "stripe"
    assert call.kwargs["provider_mode"] == "test"
    assert call.kwargs["provider_account_id"] == "platform"
    evidence = call.kwargs["verified_event"]
    assert evidence.provider_event_id == inbox.provider_event_id
    assert evidence.payload_sha256 == inbox.payload_sha256
    assert evidence.signature_reference.startswith("billing-webhook:")
    cast(AsyncMock, repository.mark_processed).assert_awaited_once()


@pytest.mark.asyncio
async def test_worker_applies_checkout_outcome_without_subscription_projection(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    inbox = _inbox(settings=settings, payload=b'{"id":"evt_worker123"}')
    checkout_outcome = ProviderCheckoutOutcome(
        event_id=inbox.provider_event_id,
        checkout_session_id=uuid4(),
        external_session_id="sim_cs_worker",
        workspace_id=uuid4(),
        actor_user_id=uuid4(),
        plan_code="premium",
        plan_revision_id=uuid4(),
        external_price_id="sim_price_worker",
        checkout_request_fingerprint="a" * 64,
        command_idempotency_key_hash="b" * 64,
        expected_revision=1,
        outcome="succeeded",
        occurred_at=datetime.now(UTC),
    )
    connector = cast(BillingConnector, _Connector(None, checkout_outcome=checkout_outcome))
    subscription_applicator = cast(
        BillingProviderSubscriptionApplicator,
        SimpleNamespace(apply_provider_subscription=AsyncMock()),
    )
    checkout_applicator = cast(
        BillingProviderCheckoutOutcomeApplicator,
        SimpleNamespace(
            apply_provider_checkout_outcome=AsyncMock(
                return_value=BillingCheckoutOutcomeApplicationResult(
                    workspace_id=checkout_outcome.workspace_id,
                    checkout_session_id=checkout_outcome.checkout_session_id,
                    status=CommerceCheckoutStatus.COMPLETED,
                    revision=2,
                    changed=True,
                )
            )
        ),
    )
    handler = BillingConnectorEventJobHandler(
        settings=settings,
        connectors=_registry(connector),
        repository=_repository(inbox),
        applicator=subscription_applicator,
        checkout_applicator=checkout_applicator,
    )

    result = await handler.execute(context=_context(inbox))

    assert result.applied is True
    assert result.workspace_id == checkout_outcome.workspace_id
    cast(AsyncMock, checkout_applicator.apply_provider_checkout_outcome).assert_awaited_once()
    cast(AsyncMock, subscription_applicator.apply_provider_subscription).assert_not_awaited()


@pytest.mark.asyncio
async def test_worker_treats_provider_revision_or_price_mismatch_as_terminal(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    inbox = _inbox(settings=settings, payload=b"{}")
    subscription = _subscription(event_id=inbox.provider_event_id)
    applicator = cast(
        BillingProviderSubscriptionApplicator,
        SimpleNamespace(
            apply_provider_subscription=AsyncMock(side_effect=BadRequest(error="BILLING_PROVIDER_PRICE_INVALID"))
        ),
    )
    handler = BillingConnectorEventJobHandler(
        settings=settings,
        connectors=_registry(cast(BillingConnector, _Connector(subscription))),
        repository=_repository(inbox),
        applicator=applicator,
    )

    with pytest.raises(PermanentJobExecutionError) as captured:
        await handler.execute(context=_context(inbox))

    assert captured.value.code == BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE


def test_provider_application_keeps_credit_account_pinned_to_event_revision() -> None:
    subscription = _subscription(event_id="evt_account123")
    account = cast(
        WorkspaceCreditAccount,
        SimpleNamespace(
            plan_revision_id=uuid4(),
            period_start=datetime.now(UTC),
            period_end=datetime.now(UTC),
            period_identity="free:before",
        ),
    )

    BillingProviderSubscriptionApplicationService._apply_credit_account(
        account=account,
        incoming=subscription,
        provider="stripe",
    )

    assert account.plan_revision_id == subscription.plan_revision_id
    assert account.period_start == subscription.current_period_start
    assert account.period_end == subscription.current_period_end
    assert str(subscription.plan_revision_id) in account.period_identity


@pytest.mark.asyncio
async def test_provider_confirmed_transition_applies_only_the_resolved_convergence() -> None:
    subscription = _subscription(event_id="evt_transition123").model_copy(
        update={
            "confirmed_transition": ProviderConfirmedTransitionEvidence(
                provider_schedule_id="sub_sched_transition123",
                target_revision_id=uuid4(),
                effective_at=datetime.now(UTC),
            )
        }
    )
    workspace_subscription = SimpleNamespace(
        plan_revision_id=uuid4(),
        refresh_from_db=AsyncMock(),
    )
    assert subscription.confirmed_transition is not None
    application = ProviderConfirmedConvergenceApplication(
        preview_id=uuid4(),
        workspace_id=subscription.workspace_id,
        target_revision_id=subscription.confirmed_transition.target_revision_id,
        effective_at=subscription.confirmed_transition.effective_at,
        provider_event_id=subscription.event_id,
        idempotency_key="provider-schedule:sub_sched_transition123:evt_transition123",
        correlation_id=uuid4(),
    )
    resolver = SimpleNamespace(resolve=AsyncMock(return_value=application))
    convergence = SimpleNamespace(apply_provider_confirmed=AsyncMock())
    service = BillingProviderSubscriptionApplicationService(
        access_state=cast(Any, object()),
        convergence=cast(Any, convergence),
        convergence_resolver=cast(Any, resolver),
    )
    conn = cast(Any, object())

    await service._apply_confirmed_convergence(
        subscription=subscription,
        provider_event_id=subscription.event_id,
        workspace_subscription=workspace_subscription,
        conn=conn,
    )

    resolver.resolve.assert_awaited_once_with(
        workspace_id=subscription.workspace_id,
        evidence=subscription.confirmed_transition,
        provider_event_id=subscription.event_id,
        correlation_id=resolver.resolve.await_args.kwargs["correlation_id"],
        conn=conn,
    )
    convergence.apply_provider_confirmed.assert_awaited_once_with(request=application, conn=conn)
    workspace_subscription.refresh_from_db.assert_awaited_once_with(using_db=conn)


@pytest.mark.asyncio
async def test_provider_target_revision_without_signed_schedule_evidence_does_not_locally_rebind() -> None:
    subscription = _subscription(event_id="evt_unbound123")
    workspace_subscription = SimpleNamespace(plan_revision_id=uuid4())
    service = BillingProviderSubscriptionApplicationService(
        access_state=cast(Any, object()),
        convergence=cast(Any, object()),
        convergence_resolver=cast(Any, object()),
    )

    with pytest.raises(Exception, match="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED"):
        await service._apply_confirmed_convergence(
            subscription=subscription,
            provider_event_id=subscription.event_id,
            workspace_subscription=workspace_subscription,
            conn=cast(Any, object()),
        )


@pytest.mark.asyncio
async def test_provider_schedule_mismatch_does_not_apply_or_rebind() -> None:
    subscription = _subscription(event_id="evt_schedule_mismatch123").model_copy(
        update={
            "confirmed_transition": ProviderConfirmedTransitionEvidence(
                provider_schedule_id="sub_sched_mismatch123",
                target_revision_id=uuid4(),
                effective_at=datetime.now(UTC),
            )
        }
    )
    resolver = SimpleNamespace(
        resolve=AsyncMock(side_effect=Conflict(error="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED"))
    )
    convergence = SimpleNamespace(apply_provider_confirmed=AsyncMock())
    workspace_subscription = SimpleNamespace(plan_revision_id=uuid4())
    service = BillingProviderSubscriptionApplicationService(
        access_state=cast(Any, object()),
        convergence=cast(Any, convergence),
        convergence_resolver=cast(Any, resolver),
    )

    with pytest.raises(Exception, match="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED"):
        await service._apply_confirmed_convergence(
            subscription=subscription,
            provider_event_id=subscription.event_id,
            workspace_subscription=workspace_subscription,
            conn=cast(Any, object()),
        )

    convergence.apply_provider_confirmed.assert_not_awaited()


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
