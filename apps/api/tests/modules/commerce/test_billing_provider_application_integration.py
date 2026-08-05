from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.commerce.access_facts import CommercialAccessFact
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
    EntitlementAllocationMode,
    PlanAccessConvergence,
    PlanRevisionStatus,
    SubscriptionRevisionTransition,
    SubscriptionRevisionTransitionItem,
    SubscriptionStatus,
    SubscriptionTransitionStatus,
    WorkspaceCommercialAccess,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.models.jobs.background_job import BackgroundJobRecord, JobDispatchOutboxRecord
from src.models.organization.organization import Organization
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.access_state.fact_outbox import TortoiseCommercialAccessFactOutbox
from src.modules.commerce.access_state.schema import (
    CommercialAccessProjection,
    CommercialAccessState,
    CommercialAccessStateApplyResult,
    CommercialAccessTransitionFact,
    CommercialLifecycleNotificationFact,
)
from src.modules.commerce.billing_connector import ProviderDunningEvent, ProviderSubscription
from src.modules.commerce.billing_provider_application_service import (
    BillingProviderSubscriptionApplicationService,
    VerifiedBillingProviderEvent,
)
from src.modules.commerce.convergence.service import PlanAccessConvergenceService
from src.modules.commerce.entitlement_schema import WORKSPACE_ROLES_MANAGE_ENTITLEMENT
from src.modules.commerce.subscription_transitions.provider_confirmation import (
    TortoiseProviderConfirmedConvergenceResolver,
)
from src.modules.commerce.subscription_transitions.schema import ProviderConfirmedTransitionEvidence
from src.modules.jobs.service import BackgroundJobService

pytestmark = pytest.mark.integration


class _FailingConvergence:
    async def apply_provider_confirmed(self, **_kwargs: object) -> None:
        raise RuntimeError("injected convergence failure")


async def _scheduled_transition_fixture() -> tuple[
    Workspace,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevision,
    WorkspaceSubscription,
    PlanAccessConvergence,
    SubscriptionRevisionTransitionItem,
]:
    now = datetime.now(UTC).replace(microsecond=0)
    suffix = uuid4().hex[:16]
    organization = await Organization.create(slug=f"billing-provider-{suffix}", name="Billing Provider")
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Billing Provider",
        owner_user_id=uuid4(),
        created_by_user_id=uuid4(),
    )
    plan = await CommercePlan.create(code=f"billing-provider-{suffix}")
    roles_manage = await CommerceEntitlementDefinition.create(
        key=WORKSPACE_ROLES_MANAGE_ENTITLEMENT,
        supports_workspace_allocation=True,
    )
    source = await _revision(plan=plan, sequence=1, now=now, suffix=suffix)
    target = await _revision(plan=plan, sequence=2, now=now, suffix=suffix)
    await _roles_manage_entitlement(revision=source, entitlement=roles_manage)
    await _roles_manage_entitlement(revision=target, entitlement=roles_manage)
    await CommercePlanRevisionPrice.create(
        plan_revision_id=target.id,
        provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=10_000_000,
        external_price_id=f"price-target-{suffix}",
    )
    effective_at = now + timedelta(days=30)
    subscription = await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=source.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=now,
        current_period_end=effective_at,
        billing_provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        external_customer_id=f"cus-{suffix}",
        external_subscription_id=f"sub-{suffix}",
    )
    await WorkspaceCreditAccount.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        plan_revision_id=source.id,
        period_start=now,
        period_end=effective_at,
        period_identity=f"provider:stripe:sub-{suffix}:{source.id}:{effective_at.isoformat()}",
    )
    await WorkspaceCommercialAccess.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        state=CommercialAccessState.NORMAL,
        source_identity=f"provider:stripe:evt-bootstrap-{suffix}",
    )
    convergence = await PlanAccessConvergence.create(
        workspace_id=workspace.id,
        source_plan_revision_id=source.id,
        target_plan_revision_id=target.id,
        preview_token_hash=f"convergence-{suffix}",
        effective_at=effective_at,
        status=SubscriptionTransitionStatus.SCHEDULED,
        revision=1,
    )
    transition = await SubscriptionRevisionTransition.create(
        source_plan_revision_id=source.id,
        target_plan_revision_id=target.id,
        reason="integration test",
        preview_token_hash=f"transition-preview-{suffix}",
        idempotency_key=f"transition-key-{suffix}",
        requested_at=now,
        status=SubscriptionTransitionStatus.SCHEDULED,
        correlation_id=uuid4(),
    )
    item = await SubscriptionRevisionTransitionItem.create(
        transition_id=transition.id,
        subscription_id=subscription.id,
        convergence_id=convergence.id,
        requires_convergence=True,
        effective_at=effective_at,
        provider_schedule_id=f"sub_sched_{suffix}",
        status=SubscriptionTransitionStatus.SCHEDULED,
    )
    return workspace, plan, source, target, subscription, convergence, item


async def _revision(*, plan: CommercePlan, sequence: int, now: datetime, suffix: str) -> CommercePlanRevision:
    return await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=sequence,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key=f"commerce:PLAN_{sequence}_{suffix}",
        description_i18n_key=f"commerce:PLAN_{sequence}_DESCRIPTION_{suffix}",
        credit_grant_amount=0,
        credit_refresh_interval="none",
        credit_value_micros=1,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=now,
    )


async def _roles_manage_entitlement(
    *, revision: CommercePlanRevision, entitlement: CommerceEntitlementDefinition
) -> None:
    await CommercePlanRevisionEntitlement.create(
        plan_revision_id=revision.id,
        entitlement_id=entitlement.id,
        is_included=True,
        allocation_mode=EntitlementAllocationMode.WORKSPACE,
        seat_limit_kind=None,
        seat_limit_value=None,
    )


def _provider_subscription(
    *,
    workspace: Workspace,
    plan: CommercePlan,
    target: CommercePlanRevision,
    current: WorkspaceSubscription,
    schedule_id: str,
    event_id: str,
) -> ProviderSubscription:
    assert current.external_customer_id is not None
    assert current.external_subscription_id is not None
    period_start = current.current_period_end
    return ProviderSubscription(
        event_id=event_id,
        workspace_id=workspace.id,
        plan_id=plan.id,
        plan_revision_id=target.id,
        external_price_id=f"price-target-{current.external_subscription_id.removeprefix('sub-')}",
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        customer_id=current.external_customer_id,
        subscription_id=current.external_subscription_id,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=period_start,
        current_period_end=period_start + timedelta(days=30),
        cancel_at_period_end=False,
        confirmed_transition=ProviderConfirmedTransitionEvidence(
            provider_schedule_id=schedule_id,
            target_revision_id=target.id,
            effective_at=period_start,
        ),
    )


def _verified_event(event_id: str) -> VerifiedBillingProviderEvent:
    return VerifiedBillingProviderEvent(
        provider_event_id=event_id,
        payload_sha256="a" * 64,
        signature_reference=f"billing-webhook:{event_id}",
    )


async def test_verified_stripe_schedule_evidence_applies_convergence_and_rebinds_in_one_transaction(
    db_schema,
) -> None:
    _ = db_schema
    workspace, plan, source, target, current, convergence, item = await _scheduled_transition_fixture()
    assert item.provider_schedule_id is not None
    event_id = f"evt-success-{uuid4().hex}"
    incoming = _provider_subscription(
        workspace=workspace,
        plan=plan,
        target=target,
        current=current,
        schedule_id=item.provider_schedule_id,
        event_id=event_id,
    )

    await BillingProviderSubscriptionApplicationService().apply_provider_subscription(
        subscription=incoming,
        provider="stripe",
        provider_mode="test",
        provider_account_id="platform",
        verified_event=_verified_event(event_id),
    )

    await current.refresh_from_db()
    account = await WorkspaceCreditAccount.get(workspace_id=workspace.id)
    await convergence.refresh_from_db()
    application = await CommerceProviderEventApplication.get(provider_event_id=event_id)
    assert current.plan_revision_id == target.id
    assert current.revision == 2
    assert account.plan_revision_id == target.id
    assert account.period_start == incoming.current_period_start
    assert convergence.status == SubscriptionTransitionStatus.APPLIED
    assert convergence.revision == 2
    assert application.result_code == "applied"
    assert application.applied_at is not None
    assert current.plan_revision_id != source.id


async def test_verified_dunning_uses_the_eager_loaded_plan_revision_for_current_access(db_schema) -> None:
    _ = db_schema
    workspace, plan, source, _target, current, _convergence, _item = await _scheduled_transition_fixture()
    now = datetime.now(UTC).replace(microsecond=0)
    external_price_id = f"price-current-{uuid4().hex}"
    provider_period_id = f"invoice-{uuid4().hex}"
    event_id = f"evt-dunning-{uuid4().hex}"
    assert current.external_customer_id is not None
    assert current.external_subscription_id is not None

    await CommercePlanRevisionPrice.create(
        plan_revision_id=source.id,
        provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=10_000_000,
        external_price_id=external_price_id,
    )
    policy = await CommerceDunningPolicy.create(
        provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        revision=1,
        is_active=True,
        policy={
            "recoveryDeadlineSource": "provider",
            "paymentGraceEffects": {"meteredEffects": "blocked"},
            "paymentRestrictedEffects": {"valueExpansion": "blocked"},
        },
    )
    access = await WorkspaceCommercialAccess.get(workspace_id=workspace.id)
    incoming = ProviderSubscription(
        event_id=event_id,
        workspace_id=workspace.id,
        plan_id=plan.id,
        plan_revision_id=source.id,
        external_price_id=external_price_id,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        customer_id=current.external_customer_id,
        subscription_id=current.external_subscription_id,
        status=SubscriptionStatus.PAST_DUE,
        current_period_start=current.current_period_start,
        current_period_end=current.current_period_end,
        cancel_at_period_end=False,
        dunning_event=ProviderDunningEvent(
            kind="payment_failure",
            provider_period_id=provider_period_id,
            occurred_at=now,
            recovery_deadline=now + timedelta(days=5),
        ),
    )

    service = BillingProviderSubscriptionApplicationService()
    await service.apply_provider_subscription(
        subscription=incoming,
        provider="stripe",
        provider_mode="test",
        provider_account_id="platform",
        verified_event=_verified_event(event_id),
    )
    await service.apply_provider_subscription(
        subscription=incoming,
        provider="stripe",
        provider_mode="test",
        provider_account_id="platform",
        verified_event=_verified_event(event_id),
    )

    await access.refresh_from_db()
    application = await CommerceProviderEventApplication.get(provider_event_id=event_id)
    assert access.state == CommercialAccessState.PAYMENT_GRACE
    assert access.state_revision == 2
    assert access.dunning_policy_id == policy.id
    assert access.provider_period_identity == provider_period_id
    assert access.source_occurred_at == now
    assert application.plan_revision_id == source.id
    assert application.provider_period_identity == provider_period_id


async def test_schedule_mismatch_persists_reconciliation_result_without_rebinding(db_schema) -> None:
    _ = db_schema
    workspace, plan, source, target, current, convergence, _item = await _scheduled_transition_fixture()
    event_id = f"evt-mismatch-{uuid4().hex}"
    incoming = _provider_subscription(
        workspace=workspace,
        plan=plan,
        target=target,
        current=current,
        schedule_id=f"sub_sched_missing_{uuid4().hex}",
        event_id=event_id,
    )

    with pytest.raises(Conflict, match="SUBSCRIPTION_TRANSITION_PROVIDER_RECONCILIATION_REQUIRED"):
        await BillingProviderSubscriptionApplicationService().apply_provider_subscription(
            subscription=incoming,
            provider="stripe",
            provider_mode="test",
            provider_account_id="platform",
            verified_event=_verified_event(event_id),
        )

    await current.refresh_from_db()
    await convergence.refresh_from_db()
    application = await CommerceProviderEventApplication.get(provider_event_id=event_id)
    assert current.plan_revision_id == source.id
    assert convergence.status == SubscriptionTransitionStatus.SCHEDULED
    assert application.result_code == "provider_reconciliation_required"
    assert application.applied_at is None


async def test_convergence_apply_failure_rolls_back_provider_application_and_subscription_rebind(db_schema) -> None:
    _ = db_schema
    workspace, plan, source, target, current, convergence, item = await _scheduled_transition_fixture()
    assert item.provider_schedule_id is not None
    event_id = f"evt-rollback-{uuid4().hex}"
    incoming = _provider_subscription(
        workspace=workspace,
        plan=plan,
        target=target,
        current=current,
        schedule_id=item.provider_schedule_id,
        event_id=event_id,
    )
    service = BillingProviderSubscriptionApplicationService(
        convergence=cast(PlanAccessConvergenceService, _FailingConvergence()),
        convergence_resolver=TortoiseProviderConfirmedConvergenceResolver(),
    )

    with pytest.raises(RuntimeError, match="injected convergence failure"):
        await service.apply_provider_subscription(
            subscription=incoming,
            provider="stripe",
            provider_mode="test",
            provider_account_id="platform",
            verified_event=_verified_event(event_id),
        )

    await current.refresh_from_db()
    await convergence.refresh_from_db()
    assert current.plan_revision_id == source.id
    assert convergence.status == SubscriptionTransitionStatus.SCHEDULED
    assert await CommerceProviderEventApplication.filter(provider_event_id=event_id).count() == 0


async def test_access_fact_job_and_dispatch_roll_back_together(db_schema) -> None:
    _ = db_schema
    now = datetime.now(UTC).replace(microsecond=0)
    workspace_id = uuid4()
    result = CommercialAccessStateApplyResult(
        projection=CommercialAccessProjection(
            workspace_id=workspace_id,
            subscription_revision_id=uuid4(),
            provider="stripe",
            provider_mode="test",
            provider_period_id="in_test",
            provider_period_start=now,
            provider_period_end=now + timedelta(days=30),
            state=CommercialAccessState.PAYMENT_GRACE,
            recovery_deadline=now + timedelta(days=1),
            access_revision=2,
            source_event_id="evt-access-fact",
            effective_at=now,
        ),
        transition=CommercialAccessTransitionFact(
            workspace_id=workspace_id,
            transition_identity="provider:stripe:evt-access-fact",
            source_event_id="evt-access-fact",
            from_state=CommercialAccessState.NORMAL,
            to_state=CommercialAccessState.PAYMENT_GRACE,
            effective_at=now,
            recovery_deadline=now + timedelta(days=1),
        ),
        notification=CommercialLifecycleNotificationFact(
            workspace_id=workspace_id,
            transition_identity="provider:stripe:evt-access-fact",
            milestone="payment_grace_started",
            effective_at=now,
            recovery_deadline=now + timedelta(days=1),
        ),
    )
    outbox = TortoiseCommercialAccessFactOutbox(jobs=BackgroundJobService(get_settings(), event_publisher=None))

    with pytest.raises(RuntimeError, match="force caller rollback"):
        async with in_transaction() as conn:
            await outbox.append_access_result(result=result, conn=conn)
            assert await CommercialAccessFact.all().using_db(conn).count() == 1
            assert await BackgroundJobRecord.all().using_db(conn).count() == 1
            assert await JobDispatchOutboxRecord.all().using_db(conn).count() == 1
            raise RuntimeError("force caller rollback")

    assert await CommercialAccessFact.all().count() == 0
    assert await BackgroundJobRecord.all().count() == 0
    assert await JobDispatchOutboxRecord.all().count() == 0
