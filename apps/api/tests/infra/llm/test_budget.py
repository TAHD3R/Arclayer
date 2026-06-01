"""Tests for atomic budget reservation operations.

Covers the R3 audit contract:
    - Unified currency unit (cost_micros)
    - Single-transaction reservation creation
    - Status-guarded COMMIT/RELEASE/EXPIRE transitions
    - Idempotent terminal paths
    - Concurrent reservation safety
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.llm.budget import (
    BudgetExceededError,
    ReservationStatusError,
    commit,
    expire_sweep,
    get_or_create_budget,
    release,
    reserve,
)
from src.models.ai.ai_budget import AIBudget, BudgetSourceType
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus


def _make_budget(**overrides):
    defaults = {
        "id": uuid4(),
        "source_type": BudgetSourceType.WORKSPACE,
        "source_id": uuid4(),
        "limit_micros": 1_000_000_000,
        "spent_micros": 0,
        "reserved_micros": 0,
        "period_start": "2026-06-01",
    }
    defaults.update(overrides)
    return AIBudget(**defaults)


def _make_reservation(budget, **overrides):
    defaults = {
        "id": uuid4(),
        "budget_id": budget.id,
        "request_id": uuid4(),
        "estimated_cost_micros": 5000,
        "reserved_cost_micros": 5000,
        "actual_cost_micros": None,
        "status": ReservationStatus.RESERVED,
        "expires_at": datetime.now(UTC) + timedelta(seconds=300),
    }
    defaults.update(overrides)
    return AIBudgetReservation(**defaults)


def _mock_execute(return_value):
    """Create an AsyncMock execute_query that returns the given value."""
    return AsyncMock(return_value=return_value)


# -- get_or_create_budget --


class TestGetOrCreateBudget:
    @pytest.mark.asyncio
    async def test_creates_new_budget(self):
        budget = _make_budget()
        with patch("src.llm.budget.AIBudget.get_or_create") as m:
            m.return_value = (budget, True)
            result = await get_or_create_budget(
                source_type=BudgetSourceType.WORKSPACE,
                source_id=budget.source_id,
                limit_micros=budget.limit_micros,
                period_start=budget.period_start,
            )
            assert result.id == budget.id

    @pytest.mark.asyncio
    async def test_returns_existing_budget(self):
        budget = _make_budget()
        with patch("src.llm.budget.AIBudget.get_or_create") as m:
            m.return_value = (budget, False)
            result = await get_or_create_budget(
                source_type=BudgetSourceType.WORKSPACE,
                source_id=budget.source_id,
                limit_micros=budget.limit_micros,
                period_start=budget.period_start,
            )
            assert result.id == budget.id

    @pytest.mark.asyncio
    async def test_is_idempotent(self):
        budget = _make_budget()
        with patch("src.llm.budget.AIBudget.get_or_create") as m:
            m.return_value = (budget, False)
            r1 = await get_or_create_budget(
                source_type=BudgetSourceType.WORKSPACE,
                source_id=budget.source_id,
                limit_micros=budget.limit_micros,
                period_start=budget.period_start,
            )
            r2 = await get_or_create_budget(
                source_type=BudgetSourceType.WORKSPACE,
                source_id=budget.source_id,
                limit_micros=budget.limit_micros,
                period_start=budget.period_start,
            )
            assert r1.id == r2.id


# -- Reserve --


class TestReserve:
    @pytest.mark.asyncio
    async def test_reserve_succeeds_with_sufficient_budget(self):
        budget = _make_budget()
        request_id = uuid4()
        reservation = _make_reservation(budget)
        execute = _mock_execute((["id"], [{"id": str(budget.id)}]))

        with patch("src.llm.budget.AIBudgetReservation.create") as mock_create:
            mock_create.return_value = reservation
            result = await reserve(
                budget_id=budget.id,
                request_id=request_id,
                estimated_cost_micros=5000,
                _execute=execute,
            )
            assert result.status == ReservationStatus.RESERVED

    @pytest.mark.asyncio
    async def test_reserve_raises_when_budget_exceeded(self):
        budget = _make_budget()
        request_id = uuid4()
        execute = _mock_execute((["id"], []))  # No rows returned = exceeded

        with (
            patch("src.llm.budget.AIBudget.get") as mock_get,
            pytest.raises(BudgetExceededError),
        ):
            mock_get.return_value = budget
            await reserve(
                budget_id=budget.id,
                request_id=request_id,
                estimated_cost_micros=2_000_000_000,
                _execute=execute,
            )

    @pytest.mark.asyncio
    async def test_reserve_uses_atomic_update_returning(self):
        """R3 requirement: reservation uses single UPDATE...RETURNING."""
        budget = _make_budget()
        request_id = uuid4()
        reservation = _make_reservation(budget)
        execute = _mock_execute((["id"], [{"id": str(budget.id)}]))

        with patch("src.llm.budget.AIBudgetReservation.create") as mock_create:
            mock_create.return_value = reservation
            await reserve(
                budget_id=budget.id,
                request_id=request_id,
                estimated_cost_micros=5000,
                _execute=execute,
            )

        sql = execute.call_args[0][0]
        assert "UPDATE ai_budgets" in sql
        assert "RETURNING id" in sql


# -- Commit --


class TestCommit:
    @pytest.mark.asyncio
    async def test_commit_transitions_from_reserved(self):
        budget = _make_budget()
        reservation = _make_reservation(budget)
        execute = _mock_execute((
            ["id", "reserved_cost_micros"],
            [{"id": str(reservation.id), "reserved_cost_micros": 5000}],
        ))

        await commit(
            reservation_id=reservation.id,
            actual_cost_micros=4800,
            _execute=execute,
        )
        # Should not raise

    @pytest.mark.asyncio
    async def test_commit_is_idempotent(self):
        """R3 requirement: terminal states are idempotent."""
        budget = _make_budget()
        reservation = _make_reservation(
            budget,
            status=ReservationStatus.COMMITTED,
            actual_cost_micros=4800,
        )
        execute = _mock_execute((["id"], []))

        with patch("src.llm.budget.AIBudgetReservation.get_or_none", return_value=reservation):
            # Should not raise — idempotent.
            await commit(
                reservation_id=reservation.id,
                actual_cost_micros=4800,
                _execute=execute,
            )

    @pytest.mark.asyncio
    async def test_commit_rejects_non_reserved_transition(self):
        """R3 requirement: status-guarded transitions."""
        budget = _make_budget()
        reservation = _make_reservation(budget, status=ReservationStatus.RELEASED)
        execute = _mock_execute((["id"], []))

        with (
            patch("src.llm.budget.AIBudgetReservation.get_or_none", return_value=reservation),
            pytest.raises(ReservationStatusError) as exc_info,
        ):
            await commit(
                reservation_id=reservation.id,
                actual_cost_micros=4800,
                _execute=execute,
            )
        assert "cannot transition" in str(exc_info.value)


# -- Release --


class TestRelease:
    @pytest.mark.asyncio
    async def test_release_transitions_from_reserved(self):
        budget = _make_budget()
        reservation = _make_reservation(budget)
        execute = _mock_execute((
            ["id", "reserved_cost_micros"],
            [{"id": str(reservation.id), "reserved_cost_micros": 5000}],
        ))

        await release(reservation_id=reservation.id, _execute=execute)

    @pytest.mark.asyncio
    async def test_release_is_idempotent(self):
        """R3 requirement: terminal states are idempotent."""
        budget = _make_budget()
        reservation = _make_reservation(budget, status=ReservationStatus.RELEASED)
        execute = _mock_execute((["id"], []))

        with patch("src.llm.budget.AIBudgetReservation.get_or_none", return_value=reservation):
            await release(reservation_id=reservation.id, _execute=execute)

    @pytest.mark.asyncio
    async def test_release_rejects_committed_transition(self):
        """R3 requirement: cannot release an already committed reservation."""
        budget = _make_budget()
        reservation = _make_reservation(budget, status=ReservationStatus.COMMITTED)
        execute = _mock_execute((["id"], []))

        with (
            patch("src.llm.budget.AIBudgetReservation.get_or_none", return_value=reservation),
            pytest.raises(ReservationStatusError),
        ):
            await release(reservation_id=reservation.id, _execute=execute)


# -- Expire Sweep --


class TestExpireSweep:
    @pytest.mark.asyncio
    async def test_expire_sweep_returns_count(self):
        execute = _mock_execute((["id"], [{"id": "aaa"}, {"id": "bbb"}]))
        count = await expire_sweep(_execute=execute)
        assert count == 2

    @pytest.mark.asyncio
    async def test_expire_sweep_empty_returns_zero(self):
        execute = _mock_execute((["id"], []))
        count = await expire_sweep(_execute=execute)
        assert count == 0


# -- Concurrent Reservation Safety --


class TestConcurrentReservations:
    @pytest.mark.asyncio
    async def test_concurrent_reservations_do_not_exceed_budget(self):
        """R3 requirement: concurrent reservations never exceed the budget."""
        budget = _make_budget(limit_micros=10000)

        call_count = 0

        async def concurrent_execute(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                return (["id"], [{"id": str(budget.id)}])
            else:
                return (["id"], [])

        with (
            patch("src.llm.budget.AIBudget.get", return_value=budget),
            patch("src.llm.budget.AIBudgetReservation.create") as mock_create,
        ):
            mock_create.return_value = _make_reservation(budget)

            async def try_reserve(amount):
                try:
                    await reserve(
                        budget_id=budget.id,
                        request_id=uuid4(),
                        estimated_cost_micros=amount,
                        _execute=AsyncMock(side_effect=concurrent_execute),
                    )
                    return True
                except BudgetExceededError:
                    return False

            results = await asyncio.gather(
                try_reserve(5000),
                try_reserve(5000),
                try_reserve(5000),
            )

        assert results == [True, True, False]
