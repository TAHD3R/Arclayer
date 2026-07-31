from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from tortoise.transactions import in_transaction

from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CommercePlan,
    CommercePlanRevision,
    PlanAccessConvergence,
    PlanRevisionStatus,
    SubscriptionRevisionTransition,
    SubscriptionRevisionTransitionItem,
    SubscriptionStatus,
    WorkspaceSubscription,
)
from src.models.organization.organization import Organization
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.subscription_transitions.provider_confirmation import (
    TortoiseProviderConfirmedConvergenceResolver,
)
from src.modules.commerce.subscription_transitions.schema import ProviderConfirmedTransitionEvidence

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_resolver_uses_postgres_item_lock_before_nullable_relation_load(db_schema) -> None:
    _ = db_schema
    now = datetime.now(UTC)
    organization = await Organization.create(slug=f"resolver-{uuid4().hex[:16]}", name="Resolver")
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Resolver",
        owner_user_id=uuid4(),
        created_by_user_id=uuid4(),
    )
    plan = await CommercePlan.create(code=f"resolver-{uuid4().hex[:16]}")
    source = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:SOURCE",
        description_i18n_key="commerce:SOURCE_DESCRIPTION",
        credit_grant_amount=0,
        credit_refresh_interval="none",
        credit_value_micros=1,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=now,
    )
    target = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=2,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:TARGET",
        description_i18n_key="commerce:TARGET_DESCRIPTION",
        credit_grant_amount=0,
        credit_refresh_interval="none",
        credit_value_micros=1,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=now,
    )
    subscription = await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=source.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        billing_provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        external_subscription_id="sub_resolver",
    )
    convergence = await PlanAccessConvergence.create(
        workspace_id=workspace.id,
        source_plan_revision_id=source.id,
        target_plan_revision_id=target.id,
        preview_token_hash=uuid4().hex,
        effective_at=subscription.current_period_end,
        status="scheduled",
        revision=1,
    )
    transition = await SubscriptionRevisionTransition.create(
        source_plan_revision_id=source.id,
        target_plan_revision_id=target.id,
        reason="resolver test",
        preview_token_hash=uuid4().hex,
        idempotency_key=f"resolver-{uuid4().hex}",
        requested_at=now,
        status="scheduled",
        correlation_id=uuid4(),
    )
    item = await SubscriptionRevisionTransitionItem.create(
        transition_id=transition.id,
        subscription_id=subscription.id,
        convergence_id=convergence.id,
        requires_convergence=True,
        effective_at=subscription.current_period_end,
        provider_schedule_id=f"schedule-{uuid4().hex}",
        status="scheduled",
    )

    async with in_transaction() as conn:
        result = await TortoiseProviderConfirmedConvergenceResolver().resolve(
            workspace_id=workspace.id,
            evidence=ProviderConfirmedTransitionEvidence(
                provider_schedule_id=item.provider_schedule_id,
                target_revision_id=target.id,
                effective_at=subscription.current_period_end,
            ),
            provider_event_id="evt_resolver",
            correlation_id=uuid4(),
            conn=conn,
        )

    assert result.preview_id == convergence.id
