from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
from dataclasses import dataclass
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
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionPrice,
    CommerceProviderEventApplication,
    CreditRefreshInterval,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.models.connectors.inbox import ConnectorEventInbox, ConnectorEventInboxStatus
from src.models.jobs.background_job import BackgroundJobRecord, JobDispatchOutboxRecord
from src.models.organization.organization import Organization
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.billing_connector import BillingConnector
from src.modules.commerce.billing_event_acceptance_service import BillingEventAcceptanceService
from src.modules.commerce.billing_event_job_contract import (
    BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE,
    BillingConnectorEventJobInput,
    BillingConnectorEventJobTarget,
)
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.service import BackgroundJobService
from src.settings.crypto import ensure_master_key

pytestmark = pytest.mark.integration


@dataclass(frozen=True)
class _SubscriptionFixture:
    workspace: Workspace
    plan: CommercePlan
    revision: CommercePlanRevision
    price: CommercePlanRevisionPrice
    subscription: WorkspaceSubscription
    account: WorkspaceCreditAccount


def _connector_type() -> type:
    plugin_path = Path(__file__).resolve().parents[5] / "plugins" / "arclayer-simulated-billing" / "src" / "plugin.py"
    spec = importlib.util.spec_from_file_location("integration_simulated_subscription_plugin", plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load simulated billing Connector from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(type, module.__dict__["SimulatedBillingConnector"])


SimulatedBillingConnector: Any = _connector_type()


def _settings(tmp_path: Path, *, secret: str) -> Settings:
    settings = get_settings()
    key_path = tmp_path / "subscription-lifecycle-events.key"
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
            webhook_events=("checkout.session.outcome", "subscription.lifecycle"),
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


def _payload(
    *,
    fixture: _SubscriptionFixture,
    event_id: str,
    event_timestamp: int,
    period_start: datetime,
    period_end: datetime,
) -> bytes:
    return json.dumps(
        {
            "id": event_id,
            "type": "subscription.lifecycle",
            "mode": "test",
            "account": "platform",
            "created": event_timestamp,
            "data": {
                "billing_cycle": "monthly",
                "cancel_at_period_end": False,
                "currency": "USD",
                "current_period_end": int(period_end.timestamp()),
                "current_period_start": int(period_start.timestamp()),
                "customer_id": "sim_cus_integration",
                "external_price_id": fixture.price.external_price_id,
                "plan_id": str(fixture.plan.id),
                "plan_revision_id": str(fixture.revision.id),
                "status": "active",
                "subscription_id": "sim_sub_integration",
                "workspace_id": str(fixture.workspace.id),
            },
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()


def _signature(payload: bytes, *, timestamp: int, secret: str) -> str:
    digest = hmac.new(
        secret.encode(),
        str(timestamp).encode() + b"." + payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


async def _fixture() -> _SubscriptionFixture:
    now = datetime.now(UTC).replace(microsecond=0)
    suffix = uuid4().hex[:16]
    organization = await Organization.create(slug=f"sim-sub-{suffix}", name="Simulated subscription")
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Simulated subscription",
        owner_user_id=uuid4(),
        created_by_user_id=uuid4(),
    )
    plan = await CommercePlan.create(code=f"sim-sub-{suffix}")
    revision = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key=f"commerce:PLAN_SIM_{suffix}",
        description_i18n_key=f"commerce:PLAN_SIM_DESCRIPTION_{suffix}",
        credit_grant_amount=100,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=now,
    )
    price = await CommercePlanRevisionPrice.create(
        plan_revision_id=revision.id,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=9_000_000,
        external_price_id=f"sim_price_{suffix}",
    )
    subscription = await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=revision.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=now - timedelta(days=30),
        current_period_end=now,
        billing_provider="simulated",
        provider_mode=BillingProviderMode.TEST,
    )
    account = await WorkspaceCreditAccount.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        plan_revision_id=revision.id,
        period_start=subscription.current_period_start,
        period_end=subscription.current_period_end,
        period_identity=f"bootstrap:{subscription.id}",
    )
    return _SubscriptionFixture(workspace, plan, revision, price, subscription, account)


async def test_signed_simulated_subscription_lifecycle_applies_replays_and_rejects_stale_period(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    fixture = await _fixture()
    secret = "integration-simulated-subscription-secret"
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
        webhook_events=("checkout.session.outcome", "subscription.lifecycle"),
        connector=connector,
        repository=BillingEventInboxRepository(),
        jobs=BackgroundJobService(settings, event_publisher=None),
    )
    handler = BillingConnectorEventJobHandler(settings=settings, connectors=registry)
    event_time = datetime.now(UTC).replace(microsecond=0)
    event_timestamp = int(event_time.timestamp())
    period_end = event_time + timedelta(days=30)
    payload = _payload(
        fixture=fixture,
        event_id="sim_evt_subscriptionintegration",
        event_timestamp=event_timestamp,
        period_start=event_time,
        period_end=period_end,
    )
    signature = _signature(payload, timestamp=event_timestamp, secret=secret)

    accepted = await acceptance.accept(payload=payload, signature=signature)
    replayed_acceptance = await acceptance.accept(payload=payload, signature=signature)
    inbox = await ConnectorEventInbox.get(id=accepted.inbox_id)
    applied = await handler.execute(context=_context(inbox))
    replayed_job = await handler.execute(context=_context(await ConnectorEventInbox.get(id=inbox.id)))

    assert accepted.created is True
    assert replayed_acceptance.created is False
    assert replayed_acceptance.inbox_id == accepted.inbox_id
    assert replayed_acceptance.job_id == accepted.job_id
    assert payload.decode() not in inbox.encrypted_payload
    assert applied == replayed_job
    assert applied.applied is True
    assert applied.workspace_id == fixture.workspace.id

    await fixture.subscription.refresh_from_db()
    await fixture.account.refresh_from_db()
    inbox = await ConnectorEventInbox.get(id=inbox.id)
    application = await CommerceProviderEventApplication.get(provider_event_id="sim_evt_subscriptionintegration")
    assert inbox.status == ConnectorEventInboxStatus.PROCESSED
    assert fixture.subscription.plan_revision_id == fixture.revision.id
    assert fixture.subscription.external_customer_id == "sim_cus_integration"
    assert fixture.subscription.external_subscription_id == "sim_sub_integration"
    assert fixture.subscription.current_period_start == event_time
    assert fixture.subscription.current_period_end == period_end
    assert fixture.account.plan_revision_id == fixture.revision.id
    assert fixture.account.period_start == event_time
    assert fixture.account.period_end == period_end
    assert application.result_code == "applied"
    assert application.applied_at is not None
    assert await CommerceProviderEventApplication.all().count() == 1
    assert await BackgroundJobRecord.all().count() == 1
    assert await JobDispatchOutboxRecord.all().count() == 1

    stale_payload = _payload(
        fixture=fixture,
        event_id="sim_evt_subscriptionstale",
        event_timestamp=event_timestamp,
        period_start=event_time - timedelta(days=30),
        period_end=period_end - timedelta(seconds=1),
    )
    stale_acceptance = await acceptance.accept(
        payload=stale_payload,
        signature=_signature(stale_payload, timestamp=event_timestamp, secret=secret),
    )
    stale_inbox = await ConnectorEventInbox.get(id=stale_acceptance.inbox_id)
    stale_context = _context(stale_inbox)
    with pytest.raises(PermanentJobExecutionError) as stale_error:
        await handler.execute(context=stale_context)
    await handler.project_failure(context=stale_context, error=stale_error.value)

    await fixture.subscription.refresh_from_db()
    stale_inbox = await ConnectorEventInbox.get(id=stale_inbox.id)
    assert stale_error.value.code == BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE
    assert stale_inbox.status == ConnectorEventInboxStatus.FAILED
    assert fixture.subscription.current_period_start == event_time
    assert fixture.subscription.current_period_end == period_end
    assert await CommerceProviderEventApplication.all().count() == 1
