from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import BadRequest
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CommercePlan,
    CommercePlanRevision,
    CreditRefreshInterval,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import WorkspaceCreditGrantLot
from src.models.commerce.payments import (
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
    CommerceCreditTopUpOffer,
    CommerceCreditTopUpOfferPrice,
    CommerceTransaction,
)
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.commerce.billing_connector import BillingConnector, CheckoutSession
from src.modules.commerce.schema import TopUpCheckoutSessionCreate
from src.modules.commerce.top_up_checkout_repository import TortoiseTopUpCheckoutRepository
from src.modules.commerce.top_up_checkout_service import TopUpCheckoutService
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_top_up_checkout_service_serializes_exact_replay_without_credit_side_effects(db_schema) -> None:
    _ = db_schema
    now = datetime.now(UTC)
    owner = await User.create(
        username=f"top-up-service-{uuid4().hex[:10]}",
        email=f"top-up-service-{uuid4().hex[:10]}@example.com",
        display_name="Top-up Service Owner",
    )
    organization = await OrganizationRepository().create_organization(
        slug=f"top-up-service-{uuid4().hex}",
        name="Top-up service integration",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Top-up service integration",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    plan = await CommercePlan.create(code=f"top-up-current-{uuid4().hex[:8]}", is_active=True, sort_order=10)
    revision = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:PLAN_TOP_UP_CURRENT_NAME",
        description_i18n_key="commerce:PLAN_TOP_UP_CURRENT_DESCRIPTION",
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
        external_customer_id="sim_cus_top_up_service",
    )
    account = await WorkspaceCreditAccount.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        plan_revision_id=revision.id,
        balance_credits=750,
        reserved_credits=25,
        period_start=subscription.current_period_start,
        period_end=subscription.current_period_end,
        period_identity=f"top-up-period-{uuid4().hex}",
        revision=3,
    )
    offer = await CommerceCreditTopUpOffer.create(
        code=f"credits-{uuid4().hex[:8]}",
        credit_amount=2_000,
        name_i18n_key="commerce:TOP_UP_2000_NAME",
        description_i18n_key="commerce:TOP_UP_2000_DESCRIPTION",
        is_active=True,
        sort_order=10,
        revision=4,
    )
    price = await CommerceCreditTopUpOfferPrice.create(
        offer_id=offer.id,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        currency="USD",
        amount_micros=20_000_000,
        external_price_id=f"sim_price_{uuid4().hex}",
    )
    provider_session = CheckoutSession(
        url="https://app.example.test/?billing=top-up-success&billingProvider=simulated",
        external_session_id=f"sim_top_up_cs_{uuid4().hex}",
        provider_account_id="platform",
        expires_at=now + timedelta(minutes=30),
    )
    provider = SimpleNamespace(
        provider_mode="test",
        create_top_up_checkout_session=AsyncMock(return_value=provider_session),
    )
    service = TopUpCheckoutService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        provider_name="simulated",
        repository=TortoiseTopUpCheckoutRepository(),
    )
    payload = TopUpCheckoutSessionCreate(top_up_offer_id=offer.id)
    start = asyncio.Event()

    async def create_checkout():
        await start.wait()
        return await service.create(
            workspace_id=workspace.id,
            actor_user_id=owner.id,
            idempotency_key="top-up-service-replay",
            payload=payload,
        )

    tasks = [asyncio.create_task(create_checkout()) for _ in range(2)]
    start.set()
    results = await asyncio.gather(*tasks)

    assert results[0] == results[1]
    provider.create_top_up_checkout_session.assert_awaited_once()
    checkout = await CommerceCheckoutSession.get(workspace_id=workspace.id)
    assert checkout.status == CommerceCheckoutStatus.PENDING
    assert checkout.top_up_offer_id == offer.id
    assert checkout.top_up_offer_revision == 4
    assert checkout.credit_amount == 2_000
    assert checkout.currency == "USD"
    assert checkout.amount_micros == 20_000_000
    assert checkout.external_price_id == price.external_price_id
    assert checkout.external_session_id == provider_session.external_session_id
    assert checkout.actor_user_id == owner.id
    assert checkout.revision == 1

    await CommerceCreditTopUpOffer.filter(id=offer.id).update(revision=5, credit_amount=2_500)
    await CommerceCreditTopUpOfferPrice.filter(id=price.id).update(
        amount_micros=25_000_000,
        external_price_id="sim_price_credits_2500",
    )
    replay = await service.create(
        workspace_id=workspace.id,
        actor_user_id=owner.id,
        idempotency_key="top-up-service-replay",
        payload=payload,
    )

    assert replay == results[0]
    provider.create_top_up_checkout_session.assert_awaited_once()
    await account.refresh_from_db()
    assert account.balance_credits == 750
    assert account.reserved_credits == 25
    assert account.revision == 3
    assert await CommerceCheckoutSession.filter(workspace_id=workspace.id).count() == 1
    assert await CommerceTransaction.filter(workspace_id=workspace.id).count() == 0
    assert await WorkspaceCreditLedger.filter(workspace_id=workspace.id).count() == 0
    assert await WorkspaceCreditGrantLot.filter(workspace_id=workspace.id).count() == 0

    await CommerceCreditTopUpOffer.filter(id=offer.id).update(is_active=False)
    with pytest.raises(BadRequest) as unavailable:
        await service.create(
            workspace_id=workspace.id,
            actor_user_id=owner.id,
            idempotency_key="top-up-service-inactive-offer",
            payload=payload,
        )
    assert unavailable.value.error == "BILLING_TOP_UP_OFFER_NOT_AVAILABLE"
    provider.create_top_up_checkout_session.assert_awaited_once()
