from __future__ import annotations

import importlib.util
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import SecretStr

from src.config import Settings, get_settings
from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel
from src.core.registries import ConnectorRegistry
from src.models.commerce.access_facts import CommercialAccessFact
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionPrice,
    CreditRefreshInterval,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import WorkspaceCreditGrantLot, WorkspaceCreditUsageEvent
from src.models.commerce.payments import (
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
    CommerceInvoice,
    CommerceRefund,
    CommerceTransaction,
)
from src.models.connectors.inbox import ConnectorEventInbox, ConnectorEventInboxStatus
from src.models.jobs.background_job import BackgroundJobRecord, JobDispatchOutboxRecord
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.billing_connector import BillingConnector
from src.modules.commerce.billing_event_acceptance_service import BillingEventAcceptanceService
from src.modules.commerce.billing_event_job_contract import (
    BillingConnectorEventJobInput,
    BillingConnectorEventJobTarget,
)
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.commerce.billing_provider_application_service import BillingProviderSubscriptionApplicator
from src.modules.commerce.checkout_outcome_repository import TortoiseCheckoutOutcomeRepository
from src.modules.commerce.simulated_checkout_outcome_service import (
    SimulatedCheckoutOutcomeService,
    SimulatedCheckoutOutcomeWrite,
)
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.service import BackgroundJobService
from src.modules.organization.repository import OrganizationRepository
from src.settings.crypto import ensure_master_key

pytestmark = pytest.mark.integration


def _connector_type() -> type:
    plugin_path = Path(__file__).resolve().parents[5] / "plugins" / "arclayer-simulated-billing" / "src" / "plugin.py"
    spec = importlib.util.spec_from_file_location("integration_simulated_billing_plugin", plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load simulated billing Connector from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(type, module.__dict__["SimulatedBillingConnector"])


SimulatedBillingConnector: Any = _connector_type()


def _settings(tmp_path: Path, *, secret: str) -> Settings:
    settings = get_settings()
    key_path = tmp_path / "checkout-outcome-events.key"
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
            webhook_events=("checkout.session.outcome",),
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


async def _checkout_fixture() -> tuple[CommerceCheckoutSession, WorkspaceSubscription]:
    current_plan = await CommercePlan.create(code=f"free-{uuid4().hex[:8]}", is_active=True, sort_order=10)
    current_revision = await CommercePlanRevision.create(
        plan_id=current_plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:PLAN_FREE_NAME",
        description_i18n_key="commerce:PLAN_FREE_DESCRIPTION",
        credit_grant_amount=100,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=datetime.now(UTC),
        is_selling=True,
    )
    target_plan = await CommercePlan.create(code=f"premium-{uuid4().hex[:8]}", is_active=True, sort_order=20)
    target_revision = await CommercePlanRevision.create(
        plan_id=target_plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:PLAN_PREMIUM_NAME",
        description_i18n_key="commerce:PLAN_PREMIUM_DESCRIPTION",
        credit_grant_amount=500,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=datetime.now(UTC),
        is_selling=True,
    )
    price = await CommercePlanRevisionPrice.create(
        plan_revision_id=target_revision.id,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=99_000_000,
        external_price_id=f"sim_price_{uuid4().hex}",
    )
    owner = await User.create(
        username=f"outcome-{uuid4().hex[:12]}",
        email=f"outcome-{uuid4().hex[:12]}@example.com",
        display_name="Outcome Owner",
    )
    organization = await OrganizationRepository().create_organization(
        slug=f"outcome-{uuid4().hex}",
        name="Checkout outcome",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Checkout outcome",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    now = datetime.now(UTC)
    subscription = await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=current_revision.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        cancel_at_period_end=False,
        billing_provider="simulated",
        provider_mode=BillingProviderMode.TEST,
    )
    checkout = await CommerceCheckoutSession.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        target_plan_revision_id=target_revision.id,
        plan_code=target_plan.code,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        kind="subscription",
        status=CommerceCheckoutStatus.PENDING,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=price.amount_micros,
        external_price_id=price.external_price_id,
        external_session_id=f"sim_cs_{uuid4().hex}",
        checkout_url="https://app.example.test/?billingProvider=simulated",
        idempotency_key="arclayer:checkout:" + uuid4().hex,
        request_fingerprint=uuid4().hex + uuid4().hex,
        actor_user_id=owner.id,
        expires_at=now + timedelta(minutes=30),
        revision=1,
    )
    return checkout, subscription


async def test_simulated_outcome_traverses_acceptance_job_and_checkout_projection_without_other_mutations(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    checkout, subscription = await _checkout_fixture()
    secret = "integration-simulated-signing-secret"
    settings = _settings(tmp_path, secret=secret)
    connector = cast(
        BillingConnector,
        SimulatedBillingConnector(signing_secret=secret, webhook_tolerance_seconds=300),
    )
    registry = _registry(connector)
    acceptance = BillingEventAcceptanceService(
        settings=settings,
        provider_name="simulated",
        connector_key="billing.simulated",
        connector_version="1.0.0",
        webhook_events=("checkout.session.outcome",),
        connector=connector,
        repository=BillingEventInboxRepository(),
        jobs=BackgroundJobService(settings, event_publisher=None),
    )
    service = SimulatedCheckoutOutcomeService(
        settings=settings,
        acceptance=acceptance,
        store=TortoiseCheckoutOutcomeRepository(),
    )
    subscription_applicator = cast(
        BillingProviderSubscriptionApplicator,
        SimpleNamespace(apply_provider_subscription=AsyncMock()),
    )

    accepted = await service.create(
        workspace_id=checkout.workspace_id,
        checkout_session_id=checkout.id,
        actor_user_id=checkout.actor_user_id,
        idempotency_key="integration-complete",
        payload=SimulatedCheckoutOutcomeWrite(outcome="succeeded", expected_revision=1),
    )

    assert await ConnectorEventInbox.all().count() == 1
    assert await BackgroundJobRecord.all().count() == 1
    assert await JobDispatchOutboxRecord.all().count() == 1
    command = await CommerceCheckoutOutcomeCommand.get(provider_event_id=accepted.provider_event_id)
    assert command.accepted_inbox_id == accepted.inbox_id
    assert command.accepted_job_id == accepted.job_id
    inbox = await ConnectorEventInbox.get(id=accepted.inbox_id)

    handler = BillingConnectorEventJobHandler(
        settings=settings,
        connectors=registry,
        repository=BillingEventInboxRepository(),
        applicator=subscription_applicator,
    )
    result = await handler.execute(context=_context(inbox))
    replay = await handler.execute(context=_context(await ConnectorEventInbox.get(id=inbox.id)))

    checkout = await CommerceCheckoutSession.get(id=checkout.id)
    command = await CommerceCheckoutOutcomeCommand.get(id=command.id)
    inbox = await ConnectorEventInbox.get(id=inbox.id)
    unchanged_subscription = await WorkspaceSubscription.get(id=subscription.id)
    assert result == replay
    assert result.applied is True
    assert checkout.status == CommerceCheckoutStatus.COMPLETED
    assert checkout.revision == 2
    assert checkout.completed_at == command.event_created_at
    assert command.processed_at is not None
    assert command.result_status == CommerceCheckoutStatus.COMPLETED
    assert command.result_revision == 2
    assert inbox.status == ConnectorEventInboxStatus.PROCESSED
    assert unchanged_subscription.status == SubscriptionStatus.ACTIVE
    assert unchanged_subscription.plan_revision_id == subscription.plan_revision_id
    cast(AsyncMock, subscription_applicator.apply_provider_subscription).assert_not_awaited()
    assert await CommerceInvoice.all().count() == 0
    assert await CommerceTransaction.all().count() == 0
    assert await CommerceRefund.all().count() == 0
    assert await WorkspaceCreditAccount.all().count() == 0
    assert await WorkspaceCreditLedger.all().count() == 0
    assert await WorkspaceCreditGrantLot.all().count() == 0
    assert await WorkspaceCreditUsageEvent.all().count() == 0
    assert await CommercialAccessFact.all().count() == 0
