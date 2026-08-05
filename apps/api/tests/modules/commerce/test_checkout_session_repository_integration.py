from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.analytics.audit_event import AuditEvent
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionPrice,
    CreditRefreshInterval,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceSubscription,
)
from src.models.commerce.payments import CommerceCheckoutSession, CommerceCheckoutStatus
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.checkout_session_repository import (
    SimulatedCheckoutCreate,
    TortoiseCheckoutSessionRepository,
)
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


async def _create_published_revision(*, code: str) -> tuple[CommercePlan, CommercePlanRevision]:
    plan = await CommercePlan.create(code=code, is_active=True, sort_order=10)
    revision = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key=f"commerce:PLAN_{code.upper()}_NAME",
        description_i18n_key=f"commerce:PLAN_{code.upper()}_DESCRIPTION",
        credit_grant_amount=100,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=datetime.now(UTC),
        is_selling=True,
    )
    return plan, revision


async def test_simulated_checkout_repository_serializes_replay_and_persists_exact_evidence(db_schema) -> None:
    _ = db_schema
    _, current_revision = await _create_published_revision(code=f"free-{uuid4().hex[:8]}")
    target_plan, target_revision = await _create_published_revision(code=f"premium-{uuid4().hex[:8]}")
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
        username=f"checkout-{uuid4().hex[:12]}",
        email=f"checkout-{uuid4().hex[:12]}@example.com",
        display_name="Checkout Owner",
    )
    organization = await OrganizationRepository().create_organization(
        slug=f"checkout-{uuid4().hex}",
        name="Checkout persistence",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Checkout persistence",
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
    command = SimulatedCheckoutCreate(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        target_plan_revision_id=target_revision.id,
        plan_code=target_plan.code,
        provider_account_id="platform",
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
    )
    repository = TortoiseCheckoutSessionRepository()
    start = asyncio.Event()

    async def claim_checkout():
        await start.wait()
        async with in_transaction() as conn:
            await repository.lock_idempotency_scope(idempotency_key=command.idempotency_key, conn=conn)
            replay = await repository.require_replay(
                idempotency_key=command.idempotency_key,
                request_fingerprint=command.request_fingerprint,
                conn=conn,
            )
            if replay is not None:
                return replay
            return await repository.create_simulated_checkout(
                settings=get_settings(),
                command=command,
                conn=conn,
            )

    tasks = [asyncio.create_task(claim_checkout()) for _ in range(2)]
    start.set()
    results = await asyncio.gather(*tasks)

    assert results[0].id == results[1].id
    checkout = await CommerceCheckoutSession.get(id=results[0].id)
    assert checkout.status == CommerceCheckoutStatus.PENDING
    assert checkout.plan_code == target_plan.code
    assert checkout.target_plan_revision_id == target_revision.id
    assert checkout.provider == "simulated"
    assert checkout.provider_mode == BillingProviderMode.TEST
    assert checkout.provider_account_id == "platform"
    assert checkout.external_price_id == price.external_price_id
    assert checkout.amount_micros == 99_000_000
    assert checkout.actor_user_id == owner.id
    assert checkout.request_fingerprint == command.request_fingerprint
    assert checkout.revision == 1
    assert await CommerceCheckoutSession.filter(idempotency_key=command.idempotency_key).count() == 1
    assert (
        await AuditEvent.filter(
            event_name="commerce.simulated_checkout.created",
            entity_id=checkout.id,
        ).count()
        == 1
    )

    async with in_transaction() as conn:
        await repository.lock_idempotency_scope(idempotency_key=command.idempotency_key, conn=conn)
        with pytest.raises(Conflict) as captured:
            await repository.require_replay(
                idempotency_key=command.idempotency_key,
                request_fingerprint="f" * 64,
                conn=conn,
            )
    assert captured.value.error == "BILLING_CHECKOUT_IDEMPOTENCY_CONFLICT"
