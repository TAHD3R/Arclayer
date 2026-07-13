from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.commerce.billing import BillingCycle, CommercePlan
from src.modules.commerce.billing_provider import BillingProvider, CheckoutSession
from src.modules.commerce.billing_service import BillingService
from src.modules.commerce.schema import CheckoutSessionCreate
from src.modules.commerce.service import CommerceService


@pytest.mark.asyncio
async def test_checkout_creation_does_not_mutate_local_subscription() -> None:
    workspace_id = uuid4()
    subscription = SimpleNamespace(
        plan_id=uuid4(),
        billing_cycle=BillingCycle.MONTHLY,
        external_customer_id=None,
    )
    current_plan = SimpleNamespace(id=subscription.plan_id)
    target_plan = SimpleNamespace(
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
    service = BillingService(
        settings=get_settings(),
        provider=cast(BillingProvider, provider),
        commerce=cast(CommerceService, commerce),
    )

    with patch.object(CommercePlan, "get_or_none", new=AsyncMock(return_value=target_plan)):
        result = await service.create_checkout(
            workspace_id=workspace_id,
            payload=CheckoutSessionCreate(plan_code="premium", billing_interval=BillingCycle.YEARLY),
        )

    assert result.url == "https://checkout.stripe.test/cs_test"
    assert subscription.plan_id == current_plan.id
    assert subscription.billing_cycle == BillingCycle.MONTHLY
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
