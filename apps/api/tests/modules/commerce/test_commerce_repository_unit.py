from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.modules.commerce.repository import BillingCheckoutPlan, CommerceRepository


@pytest.mark.asyncio
async def test_checkout_plan_reader_returns_an_immutable_active_plan_projection() -> None:
    plan_id = uuid4()
    persisted_plan = SimpleNamespace(
        id=plan_id,
        code="premium",
        currency="USD",
    )
    get_plan = AsyncMock(return_value=persisted_plan)
    repository = CommerceRepository()

    with patch.object(repository, "get_plan_by_code", new=get_plan):
        result = await repository.get_active_checkout_plan(code="premium")

    assert result == BillingCheckoutPlan(
        id=plan_id,
        code="premium",
        currency="USD",
    )
    get_plan.assert_awaited_once_with(code="premium", active_only=True)
