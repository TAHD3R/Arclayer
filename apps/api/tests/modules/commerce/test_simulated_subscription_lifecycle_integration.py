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
from src.core.exceptions import ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.models.commerce.access_facts import CommercialAccessFact, CommercialAccessFactKind
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CommerceDunningPolicy,
    CommerceEntitlementDefinition,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    CommercePlanRevisionPrice,
    CommerceProviderEventApplication,
    CommercialAccessState,
    CommercialAccessTransition,
    CreditRefreshInterval,
    EntitlementAllocationMode,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceCommercialAccess,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.models.commerce.payments import (
    CommerceCheckoutKind,
    CommerceCheckoutOutcome,
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
)
from src.models.connectors.inbox import ConnectorEventInbox, ConnectorEventInboxStatus
from src.models.jobs.background_job import BackgroundJobRecord, JobDispatchOutboxRecord
from src.models.organization.organization import Organization
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.access_state.repository import TortoiseCommercialAccessStateRepository
from src.modules.commerce.billing_connector import BillingConnector, ProviderDunningEvent, ProviderSubscription
from src.modules.commerce.billing_event_acceptance_service import BillingEventAcceptanceService
from src.modules.commerce.billing_event_job_contract import (
    BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE,
    BillingConnectorEventJobInput,
    BillingConnectorEventJobTarget,
)
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.commerce.billing_provider_application_service import (
    BillingProviderSubscriptionApplicationService,
    VerifiedBillingProviderEvent,
)
from src.modules.commerce.entitlement_schema import WORKSPACE_ROLES_MANAGE_ENTITLEMENT
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


@dataclass(frozen=True)
class _ActivationFixture:
    workspace: Workspace
    target_plan: CommercePlan
    source_revision: CommercePlanRevision
    target_revision: CommercePlanRevision
    target_price: CommercePlanRevisionPrice
    subscription: WorkspaceSubscription
    account: WorkspaceCreditAccount
    checkout: CommerceCheckoutSession
    command: CommerceCheckoutOutcomeCommand | None
    outcome_event_id: str


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
    status: str = "active",
    dunning: dict[str, object] | None = None,
) -> bytes:
    data: dict[str, object] = {
        "billing_cycle": "monthly",
        "cancel_at_period_end": False,
        "currency": "USD",
        "current_period_end": int(period_end.timestamp()),
        "current_period_start": int(period_start.timestamp()),
        "customer_id": "sim_cus_integration",
        "external_price_id": fixture.price.external_price_id,
        "plan_id": str(fixture.plan.id),
        "plan_revision_id": str(fixture.revision.id),
        "status": status,
        "subscription_id": "sim_sub_integration",
        "workspace_id": str(fixture.workspace.id),
    }
    if dunning is not None:
        data["dunning"] = dunning
    return json.dumps(
        {
            "id": event_id,
            "type": "subscription.lifecycle",
            "mode": "test",
            "account": "platform",
            "created": event_timestamp,
            "data": data,
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


async def _activation_fixture(
    *,
    reduces_access: bool = False,
    checkout_status: CommerceCheckoutStatus = CommerceCheckoutStatus.COMPLETED,
) -> _ActivationFixture:
    now = datetime.now(UTC).replace(microsecond=0)
    suffix = uuid4().hex[:16]
    organization = await Organization.create(slug=f"sim-activation-{suffix}", name="Simulated activation")
    actor_user_id = uuid4()
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Simulated activation",
        owner_user_id=actor_user_id,
        created_by_user_id=actor_user_id,
    )
    source_plan = await CommercePlan.create(code=f"sim-source-{suffix}")
    target_plan = await CommercePlan.create(code=f"sim-target-{suffix}")
    source_revision = await _activation_revision(plan=source_plan, suffix=f"source-{suffix}", now=now)
    target_revision = await _activation_revision(plan=target_plan, suffix=f"target-{suffix}", now=now)
    roles_manage, _ = await CommerceEntitlementDefinition.get_or_create(
        key=WORKSPACE_ROLES_MANAGE_ENTITLEMENT,
        defaults={"supports_workspace_allocation": True},
    )
    await _activation_role_decision(
        revision=source_revision,
        entitlement=roles_manage,
        included=reduces_access,
    )
    await _activation_role_decision(
        revision=target_revision,
        entitlement=roles_manage,
        included=not reduces_access,
    )
    target_price = await CommercePlanRevisionPrice.create(
        plan_revision_id=target_revision.id,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=12_000_000,
        external_price_id=f"sim_price_activation_{suffix}",
    )
    subscription = await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=source_revision.id,
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
        plan_revision_id=source_revision.id,
        period_start=subscription.current_period_start,
        period_end=subscription.current_period_end,
        period_identity=f"bootstrap:{subscription.id}",
    )
    checkout_completed_at = now if checkout_status != CommerceCheckoutStatus.EXPIRED else None
    checkout = await CommerceCheckoutSession.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        target_plan_revision_id=target_revision.id,
        plan_code=target_plan.code,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        kind=CommerceCheckoutKind.SUBSCRIPTION,
        status=checkout_status,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=target_price.amount_micros,
        external_price_id=target_price.external_price_id,
        external_session_id=f"sim_cs_activation_{suffix}",
        checkout_url=f"https://app.example.test/activation/{suffix}",
        idempotency_key=f"checkout-activation-{suffix}",
        request_fingerprint="a" * 64,
        actor_user_id=actor_user_id,
        expires_at=now + timedelta(minutes=30),
        completed_at=checkout_completed_at,
        revision=2,
    )
    outcome_event_id = f"sim_evt_checkoutactivation{suffix}"
    command = None
    if checkout_status != CommerceCheckoutStatus.EXPIRED:
        succeeded = checkout_status == CommerceCheckoutStatus.COMPLETED
        command = await CommerceCheckoutOutcomeCommand.create(
            checkout_session_id=checkout.id,
            workspace_id=workspace.id,
            actor_user_id=actor_user_id,
            outcome=CommerceCheckoutOutcome.SUCCEEDED if succeeded else CommerceCheckoutOutcome.FAILED,
            expected_revision=1,
            idempotency_key=f"outcome-activation-{suffix}",
            request_fingerprint="b" * 64,
            provider_event_id=outcome_event_id,
            event_created_at=now,
            accepted_inbox_id=uuid4(),
            accepted_job_id=uuid4(),
            accepted_at=now,
            processed_at=now,
            result_status=checkout_status,
            result_revision=2,
            revision=3,
        )
    return _ActivationFixture(
        workspace=workspace,
        target_plan=target_plan,
        source_revision=source_revision,
        target_revision=target_revision,
        target_price=target_price,
        subscription=subscription,
        account=account,
        checkout=checkout,
        command=command,
        outcome_event_id=outcome_event_id,
    )


async def _activation_revision(*, plan: CommercePlan, suffix: str, now: datetime) -> CommercePlanRevision:
    return await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key=f"commerce:PLAN_{suffix}",
        description_i18n_key=f"commerce:PLAN_DESCRIPTION_{suffix}",
        credit_grant_amount=100,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=now,
    )


async def _activation_role_decision(
    *,
    revision: CommercePlanRevision,
    entitlement: CommerceEntitlementDefinition,
    included: bool,
) -> None:
    await CommercePlanRevisionEntitlement.create(
        plan_revision_id=revision.id,
        entitlement_id=entitlement.id,
        is_included=included,
        allocation_mode=EntitlementAllocationMode.WORKSPACE if included else None,
        seat_limit_kind=None,
        seat_limit_value=None,
    )


def _activation_payload(
    *,
    fixture: _ActivationFixture,
    event_id: str,
    event_time: datetime,
    external_session_id: str | None = None,
) -> bytes:
    return json.dumps(
        {
            "id": event_id,
            "type": "subscription.lifecycle",
            "mode": "test",
            "account": "platform",
            "created": int(event_time.timestamp()),
            "data": {
                "billing_cycle": "monthly",
                "cancel_at_period_end": False,
                "checkout_activation": {
                    "checkout_outcome_event_id": fixture.outcome_event_id,
                    "checkout_session_id": str(fixture.checkout.id),
                    "external_session_id": external_session_id or fixture.checkout.external_session_id,
                },
                "currency": "USD",
                "current_period_end": int((event_time + timedelta(days=30)).timestamp()),
                "current_period_start": int(event_time.timestamp()),
                "customer_id": "sim_cus_activation",
                "external_price_id": fixture.target_price.external_price_id,
                "plan_id": str(fixture.target_plan.id),
                "plan_revision_id": str(fixture.target_revision.id),
                "status": "active",
                "subscription_id": "sim_sub_activation",
                "workspace_id": str(fixture.workspace.id),
            },
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()


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


async def test_signed_simulated_dunning_projects_grace_then_restricted_access(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    fixture = await _fixture()
    policy = await CommerceDunningPolicy.create(
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        revision=1,
        is_active=True,
        policy={
            "recoveryDeadlineSource": "provider",
            "paymentGraceEffects": {"meteredEffects": "blocked"},
            "paymentRestrictedEffects": {"valueExpansion": "blocked"},
        },
    )
    access = await WorkspaceCommercialAccess.create(
        workspace_id=fixture.workspace.id,
        subscription_id=fixture.subscription.id,
        state=CommercialAccessState.NORMAL,
        source_identity=f"bootstrap:{fixture.subscription.id}",
    )
    secret = "integration-simulated-dunning-secret"
    settings = _settings(tmp_path, secret=secret)
    connector = cast(
        BillingConnector,
        SimulatedBillingConnector(signing_secret=secret, webhook_tolerance_seconds=300),
    )
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
    handler = BillingConnectorEventJobHandler(settings=settings, connectors=_registry(connector))
    event_time = datetime.now(UTC).replace(microsecond=0)
    period_end = event_time + timedelta(days=30)
    recovery_deadline = event_time + timedelta(days=5)
    failure_event_id = f"sim_evt_dunningfailure{uuid4().hex[:16]}"
    failure_payload = _payload(
        fixture=fixture,
        event_id=failure_event_id,
        event_timestamp=int(event_time.timestamp()),
        period_start=event_time,
        period_end=period_end,
        status="past_due",
        dunning={
            "kind": "payment_failure",
            "provider_period_id": "sim_period_dunning",
            "recovery_deadline": int(recovery_deadline.timestamp()),
        },
    )
    failure = await acceptance.accept(
        payload=failure_payload,
        signature=_signature(failure_payload, timestamp=int(event_time.timestamp()), secret=secret),
    )

    failure_result = await handler.execute(context=_context(await ConnectorEventInbox.get(id=failure.inbox_id)))

    await fixture.subscription.refresh_from_db()
    await fixture.account.refresh_from_db()
    await access.refresh_from_db()
    failure_transition = await CommercialAccessTransition.get(
        provider="simulated",
        provider_mode="test",
        provider_account_id="platform",
        provider_event_id=failure_event_id,
    )
    failure_facts = await CommercialAccessFact.filter(source_identity=failure_transition.source_identity)
    assert failure_result.applied is True
    assert fixture.subscription.status == SubscriptionStatus.PAST_DUE
    assert fixture.subscription.plan_revision_id == fixture.revision.id
    assert fixture.subscription.revision == 1
    assert fixture.account.plan_revision_id == fixture.revision.id
    assert access.state == CommercialAccessState.PAYMENT_GRACE
    assert access.deadline_at == recovery_deadline
    assert access.state_revision == 2
    assert access.dunning_policy_id == policy.id
    assert access.provider_period_identity == "sim_period_dunning"
    assert access.source_occurred_at == event_time
    assert failure_transition.from_state == CommercialAccessState.NORMAL
    assert failure_transition.to_state == CommercialAccessState.PAYMENT_GRACE
    assert failure_transition.subscription_revision_identity == fixture.revision.id
    assert failure_transition.provider_period_start == event_time
    assert failure_transition.provider_period_end == period_end
    assert failure_transition.resulting_state_revision == 2
    assert failure_transition.dunning_policy_revision == 1
    assert {fact.kind for fact in failure_facts} == {CommercialAccessFactKind.LIFECYCLE_NOTIFICATION}
    assert failure_facts[0].payload == {
        "milestone": "payment_grace_started",
        "recovery_deadline": recovery_deadline.isoformat(),
    }

    repeated_time = event_time + timedelta(seconds=1)
    repeated_event_id = f"sim_evt_dunningrepeat{uuid4().hex[:16]}"
    repeated_payload = _payload(
        fixture=fixture,
        event_id=repeated_event_id,
        event_timestamp=int(repeated_time.timestamp()),
        period_start=event_time,
        period_end=period_end,
        status="past_due",
        dunning={
            "kind": "payment_failure",
            "provider_period_id": "sim_period_dunning",
            "recovery_deadline": int((recovery_deadline + timedelta(days=10)).timestamp()),
        },
    )
    repeated = await acceptance.accept(
        payload=repeated_payload,
        signature=_signature(repeated_payload, timestamp=int(repeated_time.timestamp()), secret=secret),
    )
    await handler.execute(context=_context(await ConnectorEventInbox.get(id=repeated.inbox_id)))

    await access.refresh_from_db()
    repeated_application = await CommerceProviderEventApplication.get(provider_event_id=repeated_event_id)
    assert repeated_application.result_code == "dunning_state_repeat_ignored"
    assert access.deadline_at == recovery_deadline
    assert access.state_revision == 2
    assert await CommercialAccessTransition.filter(access_id=access.id).count() == 1

    final_time = event_time + timedelta(seconds=2)
    final_event_id = f"sim_evt_dunningfinal{uuid4().hex[:16]}"
    final_payload = _payload(
        fixture=fixture,
        event_id=final_event_id,
        event_timestamp=int(final_time.timestamp()),
        period_start=event_time,
        period_end=period_end,
        status="canceled",
        dunning={
            "kind": "final_unpaid",
            "provider_period_id": "sim_period_dunning",
        },
    )
    final = await acceptance.accept(
        payload=final_payload,
        signature=_signature(final_payload, timestamp=int(final_time.timestamp()), secret=secret),
    )

    final_inbox = await ConnectorEventInbox.get(id=final.inbox_id)
    final_result = await handler.execute(context=_context(final_inbox))
    replayed_final_result = await handler.execute(context=_context(await ConnectorEventInbox.get(id=final.inbox_id)))

    await fixture.subscription.refresh_from_db()
    await fixture.account.refresh_from_db()
    await access.refresh_from_db()
    final_transition = await CommercialAccessTransition.get(
        provider="simulated",
        provider_mode="test",
        provider_account_id="platform",
        provider_event_id=final_event_id,
    )
    final_facts = await CommercialAccessFact.filter(source_identity=final_transition.source_identity)
    assert final_result.applied is True
    assert replayed_final_result == final_result
    assert fixture.subscription.status == SubscriptionStatus.CANCELED
    assert fixture.subscription.plan_revision_id == fixture.revision.id
    assert fixture.subscription.revision == 1
    assert fixture.account.plan_revision_id == fixture.revision.id
    assert access.state == CommercialAccessState.PAYMENT_RESTRICTED
    assert access.deadline_at is None
    assert access.state_revision == 3
    assert access.dunning_policy_id == policy.id
    assert access.source_occurred_at == final_time
    assert final_transition.from_state == CommercialAccessState.PAYMENT_GRACE
    assert final_transition.to_state == CommercialAccessState.PAYMENT_RESTRICTED
    assert final_transition.subscription_revision_identity == fixture.revision.id
    assert final_transition.provider_period_start == event_time
    assert final_transition.provider_period_end == period_end
    assert final_transition.resulting_state_revision == 3
    assert final_transition.dunning_policy_revision == 1
    assert {fact.kind for fact in final_facts} == {
        CommercialAccessFactKind.LIFECYCLE_NOTIFICATION,
        CommercialAccessFactKind.HOSTING_HANDOFF,
    }
    final_fact_by_kind = {fact.kind: fact for fact in final_facts}
    assert final_fact_by_kind[CommercialAccessFactKind.LIFECYCLE_NOTIFICATION].payload == {
        "milestone": "payment_restricted",
        "recovery_deadline": None,
    }
    assert final_fact_by_kind[CommercialAccessFactKind.HOSTING_HANDOFF].payload == {
        "state": "payment_restricted",
        "cause": "provider_final_unpaid",
    }

    stale_event_id = f"sim_evt_dunningstale{uuid4().hex[:16]}"
    stale_payload = _payload(
        fixture=fixture,
        event_id=stale_event_id,
        event_timestamp=int(repeated_time.timestamp()),
        period_start=event_time,
        period_end=period_end,
        status="past_due",
        dunning={
            "kind": "payment_failure",
            "provider_period_id": "sim_period_dunning",
            "recovery_deadline": int((recovery_deadline + timedelta(days=20)).timestamp()),
        },
    )
    stale = await acceptance.accept(
        payload=stale_payload,
        signature=_signature(stale_payload, timestamp=int(repeated_time.timestamp()), secret=secret),
    )
    await handler.execute(context=_context(await ConnectorEventInbox.get(id=stale.inbox_id)))

    regression_time = final_time + timedelta(seconds=1)
    regression_event_id = f"sim_evt_dunningregression{uuid4().hex[:16]}"
    regression_payload = _payload(
        fixture=fixture,
        event_id=regression_event_id,
        event_timestamp=int(regression_time.timestamp()),
        period_start=event_time,
        period_end=period_end,
        status="past_due",
        dunning={
            "kind": "payment_failure",
            "provider_period_id": "sim_period_dunning",
            "recovery_deadline": int((recovery_deadline + timedelta(days=30)).timestamp()),
        },
    )
    regression = await acceptance.accept(
        payload=regression_payload,
        signature=_signature(regression_payload, timestamp=int(regression_time.timestamp()), secret=secret),
    )
    await handler.execute(context=_context(await ConnectorEventInbox.get(id=regression.inbox_id)))

    await fixture.subscription.refresh_from_db()
    await access.refresh_from_db()
    stale_application = await CommerceProviderEventApplication.get(provider_event_id=stale_event_id)
    regression_application = await CommerceProviderEventApplication.get(provider_event_id=regression_event_id)
    assert stale_application.result_code == "dunning_stale_ignored"
    assert regression_application.result_code == "dunning_state_regression_ignored"
    assert fixture.subscription.status == SubscriptionStatus.CANCELED
    assert access.state == CommercialAccessState.PAYMENT_RESTRICTED
    assert access.deadline_at is None
    assert access.state_revision == 3
    assert access.source_occurred_at == final_time
    assert await CommercialAccessTransition.filter(access_id=access.id).count() == 2
    assert await CommercialAccessFact.filter(workspace_id=fixture.workspace.id).count() == 3

    fixture.subscription.provider_mode = BillingProviderMode.LIVE
    await fixture.subscription.save(update_fields=["provider_mode"])
    historical_receipt = await TortoiseCommercialAccessStateRepository().get_transition_receipt(
        provider="simulated",
        provider_mode="test",
        provider_account_id="platform",
        provider_event_id=final_event_id,
    )
    assert historical_receipt is not None
    assert historical_receipt.projection.subscription_revision_id == fixture.revision.id
    assert historical_receipt.projection.provider_mode == "test"
    assert historical_receipt.projection.provider_period_id == "sim_period_dunning"
    assert historical_receipt.projection.access_revision == 3


@pytest.mark.parametrize(
    ("policy_payload", "expected_error"),
    [
        (None, "COMMERCIAL_DUNNING_POLICY_UNAVAILABLE"),
        (
            {
                "recoveryDeadlineSource": "local",
                "paymentGraceEffects": {"meteredEffects": "blocked"},
                "paymentRestrictedEffects": {"valueExpansion": "blocked"},
            },
            "COMMERCIAL_DUNNING_POLICY_INCONSISTENT",
        ),
        (
            {
                "recoveryDeadlineSource": "provider",
                "paymentGraceEffects": "blocked",
                "paymentRestrictedEffects": {"valueExpansion": "blocked"},
            },
            "COMMERCIAL_DUNNING_POLICY_INCONSISTENT",
        ),
    ],
)
async def test_dunning_rejects_missing_or_inconsistent_provider_policy(
    db_schema,
    policy_payload: dict[str, object] | None,
    expected_error: str,
) -> None:
    _ = db_schema
    fixture = await _fixture()
    access = await WorkspaceCommercialAccess.create(
        workspace_id=fixture.workspace.id,
        subscription_id=fixture.subscription.id,
        state=CommercialAccessState.NORMAL,
        source_identity=f"bootstrap:{fixture.subscription.id}",
    )
    if policy_payload is not None:
        await CommerceDunningPolicy.create(
            provider="simulated",
            provider_mode=BillingProviderMode.TEST,
            revision=1,
            is_active=True,
            policy=policy_payload,
        )
    occurred_at = datetime.now(UTC).replace(microsecond=0)
    event_id = f"sim_evt_dunningpolicy{uuid4().hex[:16]}"
    incoming = ProviderSubscription(
        event_id=event_id,
        workspace_id=fixture.workspace.id,
        plan_id=fixture.plan.id,
        plan_revision_id=fixture.revision.id,
        external_price_id=fixture.price.external_price_id,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        customer_id="sim_cus_policy",
        subscription_id="sim_sub_policy",
        status=SubscriptionStatus.PAST_DUE,
        current_period_start=occurred_at,
        current_period_end=occurred_at + timedelta(days=30),
        cancel_at_period_end=False,
        dunning_event=ProviderDunningEvent(
            kind="payment_failure",
            provider_period_id="sim_period_policy",
            occurred_at=occurred_at,
            recovery_deadline=occurred_at + timedelta(days=5),
        ),
    )

    with pytest.raises(ServiceUnavailable) as captured:
        await BillingProviderSubscriptionApplicationService().apply_provider_subscription(
            subscription=incoming,
            provider="simulated",
            provider_mode="test",
            provider_account_id="platform",
            verified_event=VerifiedBillingProviderEvent(
                provider_event_id=event_id,
                payload_sha256="a" * 64,
                signature_reference=f"billing-webhook:{event_id}",
            ),
        )

    await fixture.subscription.refresh_from_db()
    await access.refresh_from_db()
    assert captured.value.error == expected_error
    assert fixture.subscription.status == SubscriptionStatus.ACTIVE
    assert access.state == CommercialAccessState.NORMAL
    assert await CommerceProviderEventApplication.filter(provider_event_id=event_id).count() == 0
    assert await CommercialAccessTransition.filter(access_id=access.id).count() == 0


async def test_completed_checkout_activates_target_revision_through_signed_lifecycle_chain(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    fixture = await _activation_fixture()
    assert fixture.checkout.completed_at is not None
    assert fixture.command is not None
    secret = "integration-simulated-activation-secret"
    settings = _settings(tmp_path, secret=secret)
    connector = cast(
        BillingConnector,
        SimulatedBillingConnector(signing_secret=secret, webhook_tolerance_seconds=300),
    )
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
    handler = BillingConnectorEventJobHandler(settings=settings, connectors=_registry(connector))
    event_time = fixture.checkout.completed_at + timedelta(seconds=1)
    event_id = f"sim_evt_subscriptionactivation{uuid4().hex[:16]}"
    payload = _activation_payload(fixture=fixture, event_id=event_id, event_time=event_time)
    signature = _signature(payload, timestamp=int(event_time.timestamp()), secret=secret)

    accepted = await acceptance.accept(payload=payload, signature=signature)
    replayed_acceptance = await acceptance.accept(payload=payload, signature=signature)
    result = await handler.execute(context=_context(await ConnectorEventInbox.get(id=accepted.inbox_id)))
    replayed_result = await handler.execute(context=_context(await ConnectorEventInbox.get(id=accepted.inbox_id)))

    await fixture.subscription.refresh_from_db()
    await fixture.account.refresh_from_db()
    application = await CommerceProviderEventApplication.get(provider_event_id=event_id)
    assert accepted.created is True
    assert replayed_acceptance.created is False
    assert result == replayed_result
    assert result.applied is True
    assert fixture.subscription.plan_revision_id == fixture.target_revision.id
    assert fixture.subscription.revision == 2
    assert fixture.subscription.external_customer_id == "sim_cus_activation"
    assert fixture.subscription.external_subscription_id == "sim_sub_activation"
    assert fixture.account.plan_revision_id == fixture.target_revision.id
    assert fixture.account.period_start == event_time
    assert fixture.account.period_end == event_time + timedelta(days=30)
    assert application.checkout_session_id == fixture.checkout.id
    assert application.checkout_outcome_command_id == fixture.command.id
    assert application.result_code == "applied"
    assert application.applied_at is not None
    assert await CommerceProviderEventApplication.filter(provider_event_id=event_id).count() == 1


@pytest.mark.parametrize(
    "case",
    ("failed_checkout", "expired_checkout", "session_mismatch", "event_before_checkout", "access_reducing"),
)
async def test_checkout_activation_rejects_invalid_or_access_reducing_evidence(
    db_schema,
    tmp_path: Path,
    case: str,
) -> None:
    _ = db_schema
    status = {
        "failed_checkout": CommerceCheckoutStatus.FAILED,
        "expired_checkout": CommerceCheckoutStatus.EXPIRED,
    }.get(case, CommerceCheckoutStatus.COMPLETED)
    fixture = await _activation_fixture(
        reduces_access=case == "access_reducing",
        checkout_status=status,
    )
    secret = f"integration-simulated-{case}-secret"
    settings = _settings(tmp_path, secret=secret)
    connector = cast(
        BillingConnector,
        SimulatedBillingConnector(signing_secret=secret, webhook_tolerance_seconds=300),
    )
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
    handler = BillingConnectorEventJobHandler(settings=settings, connectors=_registry(connector))
    completed_at = fixture.checkout.completed_at or datetime.now(UTC).replace(microsecond=0)
    event_time = completed_at + timedelta(seconds=-1 if case == "event_before_checkout" else 1)
    event_id = f"sim_evt_subscriptionrejected{uuid4().hex[:16]}"
    payload = _activation_payload(
        fixture=fixture,
        event_id=event_id,
        event_time=event_time,
        external_session_id=("sim_cs_mismatch" if case == "session_mismatch" else None),
    )
    accepted = await acceptance.accept(
        payload=payload,
        signature=_signature(payload, timestamp=int(event_time.timestamp()), secret=secret),
    )
    inbox = await ConnectorEventInbox.get(id=accepted.inbox_id)
    context = _context(inbox)

    with pytest.raises(PermanentJobExecutionError) as captured:
        await handler.execute(context=context)
    await handler.project_failure(context=context, error=captured.value)

    await fixture.subscription.refresh_from_db()
    inbox = await ConnectorEventInbox.get(id=inbox.id)
    application = await CommerceProviderEventApplication.get(provider_event_id=event_id)
    assert captured.value.code == BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE
    assert inbox.status == ConnectorEventInboxStatus.FAILED
    assert fixture.subscription.plan_revision_id == fixture.source_revision.id
    assert fixture.subscription.revision == 1
    assert application.result_code == "provider_reconciliation_required"
    assert application.applied_at is None
    if case == "access_reducing":
        assert fixture.command is not None
        assert application.checkout_session_id == fixture.checkout.id
        assert application.checkout_outcome_command_id == fixture.command.id
    else:
        assert application.checkout_session_id is None
        assert application.checkout_outcome_command_id is None


async def test_reconciliation_retry_applies_after_checkout_outcome_evidence_arrives(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    fixture = await _activation_fixture(checkout_status=CommerceCheckoutStatus.EXPIRED)
    secret = "integration-simulated-reconciliation-retry-secret"
    settings = _settings(tmp_path, secret=secret)
    connector = cast(
        BillingConnector,
        SimulatedBillingConnector(signing_secret=secret, webhook_tolerance_seconds=300),
    )
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
    handler = BillingConnectorEventJobHandler(settings=settings, connectors=_registry(connector))
    event_time = datetime.now(UTC).replace(microsecond=0) + timedelta(seconds=1)
    event_id = f"sim_evt_subscriptionretry{uuid4().hex[:16]}"
    payload = _activation_payload(fixture=fixture, event_id=event_id, event_time=event_time)
    signature = _signature(payload, timestamp=int(event_time.timestamp()), secret=secret)
    accepted = await acceptance.accept(payload=payload, signature=signature)
    inbox = await ConnectorEventInbox.get(id=accepted.inbox_id)
    context = _context(inbox)
    with pytest.raises(PermanentJobExecutionError) as first_failure:
        await handler.execute(context=context)
    await handler.project_failure(context=context, error=first_failure.value)

    completed_at = event_time - timedelta(seconds=1)
    fixture.checkout.status = CommerceCheckoutStatus.COMPLETED
    fixture.checkout.completed_at = completed_at
    await fixture.checkout.save(update_fields=["status", "completed_at"])
    command = await CommerceCheckoutOutcomeCommand.create(
        checkout_session_id=fixture.checkout.id,
        workspace_id=fixture.workspace.id,
        actor_user_id=fixture.checkout.actor_user_id,
        outcome=CommerceCheckoutOutcome.SUCCEEDED,
        expected_revision=1,
        idempotency_key=f"outcome-retry-{uuid4().hex}",
        request_fingerprint="c" * 64,
        provider_event_id=fixture.outcome_event_id,
        event_created_at=completed_at,
        accepted_inbox_id=uuid4(),
        accepted_job_id=uuid4(),
        accepted_at=completed_at,
        processed_at=completed_at,
        result_status=CommerceCheckoutStatus.COMPLETED,
        result_revision=2,
        revision=3,
    )
    envelope = connector.verify_webhook(payload=payload, signature=signature)
    subscription = await connector.subscription_from_event(payload=payload, envelope=envelope)
    assert subscription is not None

    await BillingProviderSubscriptionApplicationService(settings=settings).apply_provider_subscription(
        subscription=subscription,
        provider="simulated",
        provider_mode="test",
        provider_account_id="platform",
        verified_event=VerifiedBillingProviderEvent(
            provider_event_id=event_id,
            payload_sha256=hashlib.sha256(payload).hexdigest(),
            signature_reference=f"billing-webhook:{event_id}",
        ),
    )

    await fixture.subscription.refresh_from_db()
    application = await CommerceProviderEventApplication.get(provider_event_id=event_id)
    assert fixture.subscription.plan_revision_id == fixture.target_revision.id
    assert fixture.subscription.revision == 2
    assert application.checkout_session_id == fixture.checkout.id
    assert application.checkout_outcome_command_id == command.id
    assert application.result_code == "applied"
    assert application.applied_at is not None
