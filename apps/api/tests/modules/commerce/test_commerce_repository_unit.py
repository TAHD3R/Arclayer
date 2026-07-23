from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.models.commerce.billing import CommercePlan
from src.modules.commerce.repository import BillingCheckoutPlan, CommercePlanRepository


@pytest.mark.asyncio
async def test_checkout_plan_reader_returns_an_immutable_active_plan_projection() -> None:
    plan_id = uuid4()
    persisted_plan = SimpleNamespace(
        id=plan_id,
        code="premium",
        name="Premium",
        price_monthly_micros=19_000_000,
        price_yearly_micros=190_000_000,
        currency="USD",
    )
    get_plan = AsyncMock(return_value=persisted_plan)

    with patch.object(CommercePlan, "get_or_none", new=get_plan):
        result = await CommercePlanRepository().get_active_checkout_plan(code="premium")

    assert result == BillingCheckoutPlan(
        id=plan_id,
        code="premium",
        name="Premium",
        price_monthly_micros=19_000_000,
        price_yearly_micros=190_000_000,
        currency="USD",
    )
    get_plan.assert_awaited_once_with(code="premium", is_active=True)
