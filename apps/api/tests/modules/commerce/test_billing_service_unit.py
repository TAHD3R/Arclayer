from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import BadRequest
from src.models.commerce.billing import BillingCycle
from src.modules.commerce.billing_connector import BillingConnector, CheckoutSession
from src.modules.commerce.billing_service import BillingService, WorkspaceBillingReader
from src.modules.commerce.repository import BillingCheckoutPlan, BillingPlanReader
from src.modules.commerce.schema import CheckoutSessionCreate


@pytest.mark.asyncio
async def test_checkout_creation_does_not_mutate_local_subscription() -> None:
    workspace_id = uuid4()
    subscription = SimpleNamespace(
        plan_id=uuid4(),
        billing_cycle=BillingCycle.MONTHLY,
        external_customer_id=None,
    )
    current_plan = SimpleNamespace(id=subscription.plan_id)
    target_plan = BillingCheckoutPlan(
        id=uuid4(),
        code="premium",
        name="Premium",
        price_monthly_micros=19_000_000,
        price_yearly_micros=190_000_000,
        currency="USD",
    )
    commerce = SimpleNamespace(
        ensure_workspace_billing=AsyncMock(return_value=(subscription, SimpleNamespace(), current_plan)),
    )
    provider = SimpleNamespace(
        create_checkout_session=AsyncMock(return_value=CheckoutSession(url="https://checkout.stripe.test/cs_test")),
    )
    plans = SimpleNamespace(get_active_checkout_plan=AsyncMock(return_value=target_plan))
    service = BillingService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        plans=cast(BillingPlanReader, plans),
        commerce=cast(WorkspaceBillingReader, commerce),
    )

    result = await service.create_checkout(
        workspace_id=workspace_id,
        payload=CheckoutSessionCreate(plan_code="premium", billing_interval=BillingCycle.YEARLY),
    )

    assert result.url == "https://checkout.stripe.test/cs_test"
    assert subscription.plan_id == current_plan.id
    assert subscription.billing_cycle == BillingCycle.MONTHLY
    plans.get_active_checkout_plan.assert_awaited_once_with(code="premium")
    provider.create_checkout_session.assert_awaited_once_with(
        workspace_id=str(workspace_id),
        plan_code="premium",
        plan_name="Premium",
        billing_cycle="yearly",
        currency="USD",
        amount_micros=190_000_000,
        success_url="https://app.arclayer.localhost/?billing=success",
        cancel_url="https://app.arclayer.localhost/?billing=canceled",
        customer_id=None,
    )


@pytest.mark.asyncio
async def test_checkout_rejects_a_missing_active_plan_before_provider_io() -> None:
    workspace_id = uuid4()
    subscription = SimpleNamespace(
        billing_cycle=BillingCycle.MONTHLY,
        external_customer_id=None,
    )
    commerce = SimpleNamespace(
        ensure_workspace_billing=AsyncMock(return_value=(subscription, SimpleNamespace(), SimpleNamespace(id=uuid4()))),
    )
    provider = SimpleNamespace(create_checkout_session=AsyncMock())
    plans = SimpleNamespace(get_active_checkout_plan=AsyncMock(return_value=None))
    service = BillingService(
        settings=get_settings(),
        provider=cast(BillingConnector, provider),
        plans=cast(BillingPlanReader, plans),
        commerce=cast(WorkspaceBillingReader, commerce),
    )

    with pytest.raises(BadRequest) as captured:
        await service.create_checkout(
            workspace_id=workspace_id,
            payload=CheckoutSessionCreate(plan_code="retired", billing_interval=BillingCycle.MONTHLY),
        )

    assert captured.value.error == "COMMERCE_PLAN_NOT_FOUND"
    plans.get_active_checkout_plan.assert_awaited_once_with(code="retired")
    provider.create_checkout_session.assert_not_awaited()
