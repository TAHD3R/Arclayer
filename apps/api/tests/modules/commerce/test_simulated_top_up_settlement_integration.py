from __future__ import annotations

import importlib.util
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Literal, cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from pydantic import SecretStr

from src.config import Settings, get_settings
from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel
from src.core.exceptions import Conflict
from src.core.registries import ConnectorRegistry
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CommercePlan,
    CommercePlanRevision,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import CreditGrantSource, WorkspaceCreditGrantLot
from src.models.commerce.payments import (
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
    CommerceCreditTopUpOffer,
    CommerceInvoice,
    CommerceRefund,
    CommerceTopUpSettlementApplication,
    CommerceTransaction,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)
from src.models.connectors.inbox import ConnectorEventInbox, ConnectorEventInboxStatus
from src.models.jobs.background_job import BackgroundJobRecord, JobDispatchOutboxRecord
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.commerce.billing_connector import BillingConnector
from src.modules.commerce.billing_event_acceptance_service import BillingEventAcceptanceService
from src.modules.commerce.billing_event_job_contract import (
    BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE,
    BillingConnectorEventJobInput,
    BillingConnectorEventJobTarget,
)
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.commerce.checkout_outcome_repository import TortoiseCheckoutOutcomeRepository
from src.modules.commerce.simulated_checkout_outcome_service import SimulatedCheckoutOutcomeWrite
from src.modules.commerce.simulated_top_up_settlement_service import SimulatedTopUpSettlementService
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.service import BackgroundJobService
from src.modules.organization.repository import OrganizationRepository
from src.settings.crypto import ensure_master_key

pytestmark = pytest.mark.integration


def _connector_type() -> type:
    plugin_path = Path(__file__).resolve().parents[5] / "plugins" / "arclayer-simulated-billing" / "src" / "plugin.py"
    spec = importlib.util.spec_from_file_location("integration_simulated_top_up_plugin", plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load simulated billing Connector from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(type, module.__dict__["SimulatedBillingConnector"])


SimulatedBillingConnector: Any = _connector_type()


@dataclass(frozen=True)
class _Fixture:
    workspace_id: UUID
    owner_id: UUID
    checkout_id: UUID
    account_id: UUID
    initial_balance: int
    initial_reserved: int
    credit_amount: int
    amount_micros: int
    external_price_id: str


def _settings(tmp_path: Path, *, secret: str) -> Settings:
    settings = get_settings()
    key_path = tmp_path / "top-up-settlement-events.key"
    ensure_master_key(key_path)
    return settings.model_copy(
        update={
            "app_env": "test",
            "billing": settings.billing.model_copy(
                update={
                    "provider": "simulated",
                    "simulated_signing_secret": SecretStr(secret),
                }
            ),
            "security": settings.security.model_copy(update={"master_key_path": key_path}),
        }
    )


def _registry(connector: BillingConnector) -> ConnectorRegistry:
    registry = ConnectorRegistry()
    registry.register(
        extension="arclayer-simulated-billing",
        definition=ConnectorDefinition(
            key="billing.simulated",
            kind=ConnectorKind.BILLING,
            version="1.0.0",
            trust_level=ConnectorTrustLevel.OFFICIAL,
            webhook_events=("top_up.checkout.outcome",),
        ),
        factory=lambda: connector,
    )
    return registry


def _context(inbox: ConnectorEventInbox):  # type: ignore[no-untyped-def]
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


async def _fixture() -> _Fixture:
    now = datetime.now(UTC)
    owner = await User.create(
        username=f"top-up-settlement-{uuid4().hex[:10]}",
        email=f"top-up-settlement-{uuid4().hex[:10]}@example.com",
        display_name="Top-up Settlement Owner",
    )
    organization = await OrganizationRepository().create_organization(
        slug=f"top-up-settlement-{uuid4().hex}",
        name="Top-up settlement integration",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Top-up settlement integration",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    plan = await CommercePlan.create(code=f"top-up-settle-{uuid4().hex[:8]}", is_active=True, sort_order=10)
    revision = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:PLAN_TOP_UP_SETTLEMENT_NAME",
        description_i18n_key="commerce:PLAN_TOP_UP_SETTLEMENT_DESCRIPTION",
        credit_grant_amount=1_000,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=now,
        is_selling=True,
    )
    subscription = await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=revision.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        cancel_at_period_end=False,
        billing_provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        external_customer_id=f"sim_cus_{uuid4().hex}",
    )
    account = await WorkspaceCreditAccount.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        plan_revision_id=revision.id,
        balance_credits=750,
        reserved_credits=25,
        period_start=subscription.current_period_start,
        period_end=subscription.current_period_end,
        period_identity=f"top-up-settlement-period-{uuid4().hex}",
        revision=3,
    )
    offer = await CommerceCreditTopUpOffer.create(
        code=f"top-up-settle-offer-{uuid4().hex[:8]}",
        credit_amount=2_000,
        name_i18n_key="commerce:TOP_UP_SETTLEMENT_NAME",
        description_i18n_key="commerce:TOP_UP_SETTLEMENT_DESCRIPTION",
        is_active=True,
        sort_order=10,
        revision=4,
    )
    external_price_id = f"sim_price_{uuid4().hex}"
    checkout = await CommerceCheckoutSession.create(
        workspace_id=workspace.id,
        subscription_id=None,
        target_plan_revision_id=None,
        top_up_offer_id=offer.id,
        top_up_offer_revision=offer.revision,
        plan_code=None,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        kind="top_up",
        status=CommerceCheckoutStatus.PENDING,
        billing_cycle=None,
        currency="USD",
        amount_micros=20_000_000,
        credit_amount=offer.credit_amount,
        external_price_id=external_price_id,
        external_session_id=f"sim_top_up_cs_{uuid4().hex}",
        checkout_url="https://app.example.test/?billingProvider=simulated",
        idempotency_key=f"arclayer:top-up-checkout:{uuid4().hex}",
        request_fingerprint=uuid4().hex + uuid4().hex,
        actor_user_id=owner.id,
        expires_at=now + timedelta(minutes=30),
        revision=1,
    )
    return _Fixture(
        workspace_id=workspace.id,
        owner_id=owner.id,
        checkout_id=checkout.id,
        account_id=account.id,
        initial_balance=account.balance_credits,
        initial_reserved=account.reserved_credits,
        credit_amount=offer.credit_amount,
        amount_micros=checkout.amount_micros,
        external_price_id=external_price_id,
    )


def _service(
    *,
    settings: Settings,
    connector: BillingConnector,
) -> tuple[SimulatedTopUpSettlementService, ConnectorRegistry]:
    registry = _registry(connector)
    acceptance = BillingEventAcceptanceService(
        settings=settings,
        provider_name="simulated",
        connector_key="billing.simulated",
        connector_version="1.0.0",
        webhook_events=("top_up.checkout.outcome",),
        connector=connector,
        repository=BillingEventInboxRepository(),
        jobs=BackgroundJobService(settings, event_publisher=None),
    )
    return (
        SimulatedTopUpSettlementService(
            settings=settings,
            acceptance=acceptance,
            store=TortoiseCheckoutOutcomeRepository(),
        ),
        registry,
    )


async def _accept(
    *,
    service: SimulatedTopUpSettlementService,
    fixture: _Fixture,
    outcome: str,
    idempotency_key: str,
) -> ConnectorEventInbox:
    accepted = await service.create(
        workspace_id=fixture.workspace_id,
        checkout_session_id=fixture.checkout_id,
        actor_user_id=fixture.owner_id,
        idempotency_key=idempotency_key,
        payload=SimulatedCheckoutOutcomeWrite(
            outcome=cast(Literal["pending", "succeeded", "failed", "canceled"], outcome),
            expected_revision=1,
        ),
    )
    return await ConnectorEventInbox.get(id=accepted.inbox_id)


def _handler(*, settings: Settings, registry: ConnectorRegistry) -> BillingConnectorEventJobHandler:
    return BillingConnectorEventJobHandler(
        settings=settings,
        connectors=registry,
        repository=BillingEventInboxRepository(),
        applicator=cast(Any, SimpleNamespace(apply_provider_subscription=AsyncMock())),
        checkout_applicator=cast(Any, SimpleNamespace(apply_provider_checkout_outcome=AsyncMock())),
    )


async def test_signed_simulated_top_up_success_grants_exact_credits_once(db_schema, tmp_path: Path) -> None:
    _ = db_schema
    fixture = await _fixture()
    secret = "integration-top-up-settlement-secret"
    settings = _settings(tmp_path, secret=secret)
    connector = cast(
        BillingConnector,
        SimulatedBillingConnector(signing_secret=secret, webhook_tolerance_seconds=300),
    )
    service, registry = _service(settings=settings, connector=connector)
    inbox = await _accept(
        service=service,
        fixture=fixture,
        outcome="succeeded",
        idempotency_key="top-up-success",
    )
    exact_replay = await service.create(
        workspace_id=fixture.workspace_id,
        checkout_session_id=fixture.checkout_id,
        actor_user_id=fixture.owner_id,
        idempotency_key="top-up-success",
        payload=SimulatedCheckoutOutcomeWrite(outcome="succeeded", expected_revision=1),
    )
    assert exact_replay.provider_event_id == inbox.provider_event_id
    assert exact_replay.inbox_id == inbox.id
    assert exact_replay.event_created is False
    with pytest.raises(Conflict, match="BILLING_CHECKOUT_OUTCOME_IDEMPOTENCY_CONFLICT"):
        await service.create(
            workspace_id=fixture.workspace_id,
            checkout_session_id=fixture.checkout_id,
            actor_user_id=fixture.owner_id,
            idempotency_key="top-up-success",
            payload=SimulatedCheckoutOutcomeWrite(outcome="pending", expected_revision=1),
        )
    handler = _handler(settings=settings, registry=registry)

    result = await handler.execute(context=_context(inbox))
    replay = await handler.execute(context=_context(await ConnectorEventInbox.get(id=inbox.id)))

    checkout = await CommerceCheckoutSession.get(id=fixture.checkout_id)
    account = await WorkspaceCreditAccount.get(id=fixture.account_id)
    command = await CommerceCheckoutOutcomeCommand.get(provider_event_id=inbox.provider_event_id)
    application = await CommerceTopUpSettlementApplication.get(provider_event_id=inbox.provider_event_id)
    transaction = await CommerceTransaction.get(id=application.transaction_id)
    ledger = await WorkspaceCreditLedger.get(id=application.ledger_entry_id)
    lot = await WorkspaceCreditGrantLot.get(id=application.grant_lot_id)
    inbox = await ConnectorEventInbox.get(id=inbox.id)

    assert result == replay
    assert result.applied is True
    assert checkout.status == CommerceCheckoutStatus.COMPLETED
    assert checkout.revision == 2
    assert checkout.completed_at == command.event_created_at
    assert command.result_status == CommerceCheckoutStatus.COMPLETED
    assert command.result_revision == 2
    assert account.balance_credits == fixture.initial_balance + fixture.credit_amount
    assert account.reserved_credits == fixture.initial_reserved
    assert account.revision == 4
    assert transaction.kind == CommerceTransactionKind.TOP_UP
    assert transaction.status == CommerceTransactionStatus.SUCCEEDED
    assert transaction.checkout_session_id == checkout.id
    assert transaction.subscription_id is None
    assert transaction.invoice_id is None
    assert transaction.currency == "USD"
    assert transaction.amount_micros == fixture.amount_micros
    assert transaction.credit_amount == fixture.credit_amount
    assert ledger.entry_type == CreditLedgerEntryType.TOP_UP
    assert ledger.delta_balance_credits == fixture.credit_amount
    assert ledger.balance_after_credits == account.balance_credits
    assert lot.source == CreditGrantSource.TOP_UP
    assert lot.granted_credits == fixture.credit_amount
    assert lot.remaining_credits == fixture.credit_amount
    assert lot.reserved_credits == 0
    assert lot.expires_at is None
    assert application.granted_checkout_session_id == checkout.id
    assert inbox.status == ConnectorEventInboxStatus.PROCESSED
    assert await CommerceTopUpSettlementApplication.all().count() == 1
    assert await CommerceTransaction.all().count() == 1
    assert await WorkspaceCreditLedger.all().count() == 1
    assert await WorkspaceCreditGrantLot.all().count() == 1
    assert await CommerceInvoice.all().count() == 0
    assert await CommerceRefund.all().count() == 0
    assert await BackgroundJobRecord.all().count() == 1
    assert await JobDispatchOutboxRecord.all().count() == 1


async def test_pending_then_success_creates_only_the_success_grant(db_schema, tmp_path: Path) -> None:
    _ = db_schema
    fixture = await _fixture()
    secret = "integration-top-up-pending-secret"
    settings = _settings(tmp_path, secret=secret)
    connector = cast(
        BillingConnector,
        SimulatedBillingConnector(signing_secret=secret, webhook_tolerance_seconds=300),
    )
    service, registry = _service(settings=settings, connector=connector)
    pending = await _accept(service=service, fixture=fixture, outcome="pending", idempotency_key="top-up-pending")
    succeeded = await _accept(
        service=service, fixture=fixture, outcome="succeeded", idempotency_key="top-up-after-pending"
    )
    handler = _handler(settings=settings, registry=registry)

    pending_result = await handler.execute(context=_context(pending))
    checkout = await CommerceCheckoutSession.get(id=fixture.checkout_id)
    account = await WorkspaceCreditAccount.get(id=fixture.account_id)
    assert pending_result.applied is True
    assert checkout.status == CommerceCheckoutStatus.PENDING
    assert checkout.revision == 1
    assert account.balance_credits == fixture.initial_balance
    assert await CommerceTransaction.all().count() == 0

    success_result = await handler.execute(context=_context(succeeded))
    checkout = await CommerceCheckoutSession.get(id=fixture.checkout_id)
    account = await WorkspaceCreditAccount.get(id=fixture.account_id)
    applications = await CommerceTopUpSettlementApplication.all().order_by("provider_event_occurred_at", "id")
    assert success_result.applied is True
    assert checkout.status == CommerceCheckoutStatus.COMPLETED
    assert account.balance_credits == fixture.initial_balance + fixture.credit_amount
    assert len(applications) == 2
    assert sum(application.transaction_id is not None for application in applications) == 1
    assert await CommerceTransaction.all().count() == 1
    assert await WorkspaceCreditLedger.all().count() == 1
    assert await WorkspaceCreditGrantLot.all().count() == 1


@pytest.mark.parametrize(
    ("outcome", "expected_status"),
    (("failed", CommerceCheckoutStatus.FAILED), ("canceled", CommerceCheckoutStatus.CANCELED)),
)
async def test_failed_or_canceled_top_up_is_terminal_without_credit_side_effects(
    db_schema,
    tmp_path: Path,
    outcome: str,
    expected_status: CommerceCheckoutStatus,
) -> None:
    _ = db_schema
    fixture = await _fixture()
    secret = f"integration-top-up-{outcome}-secret"
    settings = _settings(tmp_path, secret=secret)
    connector = cast(
        BillingConnector,
        SimulatedBillingConnector(signing_secret=secret, webhook_tolerance_seconds=300),
    )
    service, registry = _service(settings=settings, connector=connector)
    inbox = await _accept(service=service, fixture=fixture, outcome=outcome, idempotency_key=f"top-up-{outcome}")

    await _handler(settings=settings, registry=registry).execute(context=_context(inbox))

    checkout = await CommerceCheckoutSession.get(id=fixture.checkout_id)
    account = await WorkspaceCreditAccount.get(id=fixture.account_id)
    application = await CommerceTopUpSettlementApplication.get(provider_event_id=inbox.provider_event_id)
    assert checkout.status == expected_status
    assert checkout.revision == 2
    assert account.balance_credits == fixture.initial_balance
    assert account.revision == 3
    assert application.transaction_id is None
    assert application.ledger_entry_id is None
    assert application.grant_lot_id is None
    assert application.granted_checkout_session_id is None
    assert await CommerceTransaction.all().count() == 0
    assert await WorkspaceCreditLedger.all().count() == 0
    assert await WorkspaceCreditGrantLot.all().count() == 0


async def test_success_then_delayed_pending_is_rejected_without_second_grant(db_schema, tmp_path: Path) -> None:
    _ = db_schema
    fixture = await _fixture()
    secret = "integration-top-up-out-of-order-secret"
    settings = _settings(tmp_path, secret=secret)
    connector = cast(
        BillingConnector,
        SimulatedBillingConnector(signing_secret=secret, webhook_tolerance_seconds=300),
    )
    service, registry = _service(settings=settings, connector=connector)
    succeeded = await _accept(service=service, fixture=fixture, outcome="succeeded", idempotency_key="top-up-first")
    delayed = await _accept(service=service, fixture=fixture, outcome="pending", idempotency_key="top-up-delayed")
    handler = _handler(settings=settings, registry=registry)

    await handler.execute(context=_context(succeeded))
    with pytest.raises(PermanentJobExecutionError) as rejected:
        await handler.execute(context=_context(delayed))

    account = await WorkspaceCreditAccount.get(id=fixture.account_id)
    assert rejected.value.code == BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE
    assert account.balance_credits == fixture.initial_balance + fixture.credit_amount
    assert await CommerceTopUpSettlementApplication.all().count() == 1
    assert await CommerceTransaction.all().count() == 1
    assert await WorkspaceCreditLedger.all().count() == 1
    assert await WorkspaceCreditGrantLot.all().count() == 1
