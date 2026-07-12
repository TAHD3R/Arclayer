from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest

from src.llm.budget import expire_sweep
from src.models.ai.ai_budget import AIBudget, BudgetSourceType
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_expire_sweep_aggregates_multiple_holds_for_one_budget(db_schema) -> None:
    _ = db_schema
    budget = await AIBudget.create(
        source_type=BudgetSourceType.WORKSPACE,
        source_id=uuid4(),
        limit_micros=10_000,
        reserved_micros=500,
        period_start=date(2026, 7, 1),
    )
    expiration = datetime.now(UTC) - timedelta(minutes=1)
    reservations = [
        await AIBudgetReservation.create(
            budget_id=budget.id,
            request_id=uuid4(),
            estimated_cost_micros=amount,
            reserved_cost_micros=amount,
            expires_at=expiration,
        )
        for amount in (200, 300)
    ]

    assert await expire_sweep() == 2

    await budget.refresh_from_db()
    assert budget.reserved_micros == 0
    for reservation in reservations:
        await reservation.refresh_from_db()
        assert reservation.status == ReservationStatus.EXPIRED
