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
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.llm.budget import (
    BudgetExceededError,
    ReservationRequestConflictError,
    ReservationStatusError,
    commit,
    expire_sweep,
    get_or_create_budget,
    release,
    reserve,
)
from src.models.agents.runtime_v1 import AgentRunStatusV1
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
        "agent_run_id": None,
        "request_id": uuid4(),
        "estimated_cost_micros": 5000,
        "reserved_cost_micros": 5000,
        "actual_cost_micros": None,
        "status": ReservationStatus.RESERVED,
        "expires_at": datetime.now(UTC) + timedelta(seconds=300),
    }
    defaults.update(overrides)
    reservation = AIBudgetReservation(**defaults)
    reservation.agent_run_id = defaults["agent_run_id"]
    return reservation


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
    async def test_reserve_allows_interrupted_agent_run_child_work(self):
        budget = _make_budget()
        workspace_id = uuid4()
        agent_run_id = uuid4()
        actor_user_id = uuid4()
        project_id = uuid4()
        reservation = _make_reservation(budget, agent_run_id=agent_run_id)
        connection = MagicMock()
        connection.execute_query = AsyncMock(
            side_effect=[
                ([], []),
                (["id"], [{"id": str(budget.id)}]),
            ]
        )
        transaction = MagicMock()
        transaction.__aenter__ = AsyncMock(return_value=connection)
        transaction.__aexit__ = AsyncMock(return_value=None)
        run_query = MagicMock()
        run_query.using_db.return_value.select_for_update.return_value.first = AsyncMock(
            return_value=SimpleNamespace(
                workspace_id=workspace_id,
                project_id=project_id,
                owner_user_id=actor_user_id,
                status=AgentRunStatusV1.INTERRUPTED,
            )
        )

        with (
            patch("tortoise.transactions.in_transaction", return_value=transaction),
            patch(
                "src.llm.budget.AIBudgetReservation.get_or_none",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "src.models.agents.runtime_v1.AgentRunV1Record.filter",
                return_value=run_query,
            ),
            patch(
                "src.modules.commerce.credits.reserve_workspace_credits",
                new=AsyncMock(
                    return_value=SimpleNamespace(
                        account_id=None,
                        credit_value_micros=None,
                        reserved_credits=None,
                    )
                ),
            ),
            patch(
                "src.llm.budget.AIBudgetReservation.create",
                new=AsyncMock(return_value=reservation),
            ) as create_reservation,
        ):
            result = await reserve(
                budget_id=budget.id,
                request_id=uuid4(),
                estimated_cost_micros=5000,
                workspace_id=workspace_id,
                agent_run_id=agent_run_id,
                actor_user_id=actor_user_id,
                project_id=project_id,
                capability_key="ai.agents",
            )

        assert result is reservation
        assert create_reservation.await_args is not None
        assert create_reservation.await_args.kwargs["agent_run_id"] == agent_run_id

    @pytest.mark.asyncio
    async def test_reserve_reuses_same_request_without_second_budget_hold(self):
        budget = _make_budget()
        request_id = uuid4()
        reservation = _make_reservation(
            budget,
            request_id=request_id,
            estimated_cost_micros=5000,
        )
        reservation.budget_id = budget.id
        connection = MagicMock()
        connection.execute_query = AsyncMock(return_value=([], []))
        transaction = MagicMock()
        transaction.__aenter__ = AsyncMock(return_value=connection)
        transaction.__aexit__ = AsyncMock(return_value=None)

        with (
            patch("tortoise.transactions.in_transaction", return_value=transaction),
            patch(
                "src.llm.budget.AIBudgetReservation.get_or_none",
                new=AsyncMock(return_value=reservation),
            ),
        ):
            result = await reserve(
                budget_id=budget.id,
                request_id=request_id,
                estimated_cost_micros=5000,
            )

        assert result is reservation
        connection.execute_query.assert_awaited_once()
        assert connection.execute_query.await_args is not None
        assert "pg_advisory_xact_lock" in connection.execute_query.await_args.args[0]

    @pytest.mark.asyncio
    async def test_reserve_rejects_request_id_reused_with_different_cost(self):
        budget = _make_budget()
        request_id = uuid4()
        reservation = _make_reservation(
            budget,
            request_id=request_id,
            estimated_cost_micros=4000,
        )
        reservation.budget_id = budget.id
        connection = MagicMock()
        connection.execute_query = AsyncMock(return_value=([], []))
        transaction = MagicMock()
        transaction.__aenter__ = AsyncMock(return_value=connection)
        transaction.__aexit__ = AsyncMock(return_value=None)

        with (
            patch("tortoise.transactions.in_transaction", return_value=transaction),
            patch(
                "src.llm.budget.AIBudgetReservation.get_or_none",
                new=AsyncMock(return_value=reservation),
            ),
            pytest.raises(ReservationRequestConflictError),
        ):
            await reserve(
                budget_id=budget.id,
                request_id=request_id,
                estimated_cost_micros=5000,
            )

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
        assert execute.await_args is not None
        sql = execute.await_args.args[0]
        assert "SUM(reserved_cost_micros)" in sql
        assert "GROUP BY budget_id" in sql

    @pytest.mark.asyncio
    async def test_expire_sweep_empty_returns_zero(self):
        execute = _mock_execute((["id"], []))
        count = await expire_sweep(_execute=execute)
        assert count == 0

    @pytest.mark.asyncio
    async def test_expire_sweep_retries_previously_unreconciled_credit_holds(self):
        execute = _mock_execute((["id"], []))
        with (
            patch("src.llm.budget._default_executor", return_value=execute),
            patch(
                "src.llm.budget._release_expired_credit_holds",
                new=AsyncMock(),
            ) as reconcile,
        ):
            count = await expire_sweep()

        assert count == 0
        reconcile.assert_awaited_once()


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
