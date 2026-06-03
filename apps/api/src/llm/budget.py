"""Atomic budget reservation operations for AI cost control.

R3 audit contract — all money in cost_micros (microdollars):
    1 µ$ = 1/1,000,000 of a dollar.

Operations:
    reserve(budget_id, request_id, estimated_micros, ttl_seconds) → reservation
    commit(reservation_id, actual_micros) → None
    release(reservation_id) → None
    expire_sweep() → list of expired reservation IDs

Invariants:
    - Reservation is always created via a single atomic UPDATE...RETURNING.
    - Status transitions are guarded (only 'reserved' → committed/released/expired).
    - Terminal states are idempotent (committed/released/expired stay as-is).
    - reserved_micros is always consistent with the sum of active reservations.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from src.models.ai.ai_budget import AIBudget, BudgetSourceType
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus

QueryExecutor = Callable[..., Any]


def _default_executor() -> QueryExecutor:
    from tortoise import connections

    conn = connections.get("default")
    return conn.execute_query


def _default_in_transaction():
    from tortoise.transactions import in_transaction

    return in_transaction()


class BudgetExceededError(Exception):
    """Raised when the budget limit is exceeded for a reservation attempt."""

    def __init__(self, budget_id: UUID, available_micros: int, requested_micros: int) -> None:
        self.budget_id = budget_id
        self.available_micros = available_micros
        self.requested_micros = requested_micros
        super().__init__(f"Budget {budget_id} exceeded: available={available_micros}µ$, requested={requested_micros}µ$")


class ReservationNotFoundError(Exception):
    """Raised when a reservation ID does not exist."""


class ReservationStatusError(Exception):
    """Raised when a status transition is invalid (not from 'reserved')."""

    def __init__(self, reservation_id: UUID, current_status: str, target_status: str) -> None:
        self.reservation_id = reservation_id
        self.current_status = current_status
        self.target_status = target_status
        super().__init__(
            f"Reservation {reservation_id}: cannot transition from '{current_status}' to '{target_status}'"
        )


async def get_or_create_budget(
    *,
    source_type: BudgetSourceType,
    source_id: UUID,
    limit_micros: int,
    period_start: str,
) -> AIBudget:
    """Get existing budget for (type, id, period) or create it.

    Idempotent: safe to call multiple times for the same parameters.
    """
    budget, _ = await AIBudget.get_or_create(
        source_type=source_type,
        source_id=source_id,
        period_start=period_start,
        defaults={"limit_micros": limit_micros},
    )
    return budget


async def reserve(
    *,
    budget_id: UUID,
    request_id: UUID,
    estimated_cost_micros: int,
    ttl_seconds: int = 300,
    _execute: QueryExecutor | None = None,
) -> AIBudgetReservation:
    """Atomically reserve budget for an LLM call.

    Uses a single UPDATE...RETURNING pattern to prevent race conditions
    under concurrent callers.  The budget UPDATE and reservation INSERT
    are wrapped in a single database transaction.
    """
    reserve_amount = estimated_cost_micros

    async def _perform(executor: QueryExecutor, conn: Any) -> AIBudgetReservation:
        result = await executor(
            """
            UPDATE ai_budgets
            SET reserved_micros = reserved_micros + $1
            WHERE id = $2
              AND limit_micros - spent_micros - reserved_micros >= $1
            RETURNING id
            """,
            [reserve_amount, budget_id],
        )

        if not result[1]:
            budget = await AIBudget.get(id=budget_id)
            available = budget.limit_micros - budget.spent_micros - budget.reserved_micros
            raise BudgetExceededError(
                budget_id=budget_id,
                available_micros=max(available, 0),
                requested_micros=reserve_amount,
            )

        expires_at = datetime.now(UTC) + timedelta(seconds=ttl_seconds)
        reservation = await AIBudgetReservation.create(
            id=uuid.uuid4(),
            budget_id=budget_id,
            request_id=request_id,
            estimated_cost_micros=estimated_cost_micros,
            reserved_cost_micros=reserve_amount,
            status=ReservationStatus.RESERVED,
            expires_at=expires_at,
            using_db=conn,
        )
        return reservation

    if _execute is not None:
        return await _perform(_execute, None)

    from tortoise.transactions import in_transaction as _tx

    async with _tx() as conn:
        return await _perform(conn.execute_query, conn)


async def commit(
    *,
    reservation_id: UUID,
    actual_cost_micros: int,
    _execute: QueryExecutor | None = None,
    _tx: Any = None,
) -> None:
    """Commit a reservation after receiving the actual LLM usage.

    Status-guarded: only transitions from 'reserved' to 'committed'.
    Idempotent: if already committed, returns silently.
    The status transition and budget counter update are atomic.
    """

    async def _perform(executor: QueryExecutor) -> None:
        result = await executor(
            """
            UPDATE ai_budget_reservations
            SET status = $1, actual_cost_micros = $2
            WHERE id = $3 AND status = $4
            RETURNING id, reserved_cost_micros
            """,
            [ReservationStatus.COMMITTED.value, actual_cost_micros, reservation_id, ReservationStatus.RESERVED.value],
        )

        if not result[1]:
            existing = await AIBudgetReservation.get_or_none(id=reservation_id)
            if existing is None:
                raise ReservationNotFoundError(f"Reservation {reservation_id} not found")
            if existing.status == ReservationStatus.COMMITTED:
                return  # Idempotent.
            raise ReservationStatusError(
                reservation_id=reservation_id,
                current_status=existing.status.value,
                target_status=ReservationStatus.COMMITTED.value,
            )

        row = result[1][0]
        reserved_micros = row["reserved_cost_micros"]

        await executor(
            """
            UPDATE ai_budgets
            SET reserved_micros = reserved_micros - $1,
                spent_micros = spent_micros + $2
            WHERE id = (SELECT budget_id FROM ai_budget_reservations WHERE id = $3)
            """,
            [reserved_micros, actual_cost_micros, reservation_id],
        )

    if _execute is not None:
        return await _perform(_execute)

    from tortoise.transactions import in_transaction as _tx_fn

    async with _tx_fn() as conn:
        return await _perform(conn.execute_query)


async def release(
    *,
    reservation_id: UUID,
    _execute: QueryExecutor | None = None,
) -> None:
    """Release a reservation, returning funds to the budget.

    Status-guarded: only transitions from 'reserved' to 'released'.
    Idempotent: if already released, returns silently.
    The status transition and budget counter update are atomic.
    """

    async def _perform(executor: QueryExecutor) -> None:
        result = await executor(
            """
            UPDATE ai_budget_reservations
            SET status = $1
            WHERE id = $2 AND status = $3
            RETURNING id, reserved_cost_micros
            """,
            [ReservationStatus.RELEASED.value, reservation_id, ReservationStatus.RESERVED.value],
        )

        if not result[1]:
            existing = await AIBudgetReservation.get_or_none(id=reservation_id)
            if existing is None:
                raise ReservationNotFoundError(f"Reservation {reservation_id} not found")
            if existing.status == ReservationStatus.RELEASED:
                return  # Idempotent.
            raise ReservationStatusError(
                reservation_id=reservation_id,
                current_status=existing.status.value,
                target_status=ReservationStatus.RELEASED.value,
            )

        row = result[1][0]
        reserved_micros = row["reserved_cost_micros"]

        await executor(
            """
            UPDATE ai_budgets
            SET reserved_micros = reserved_micros - $1
            WHERE id = (SELECT budget_id FROM ai_budget_reservations WHERE id = $2)
            """,
            [reserved_micros, reservation_id],
        )

    if _execute is not None:
        return await _perform(_execute)

    from tortoise.transactions import in_transaction as _tx_fn

    async with _tx_fn() as conn:
        return await _perform(conn.execute_query)


async def expire_sweep(
    _execute: QueryExecutor | None = None,
) -> int:
    """Sweep expired reservations, returning funds to budgets.

    Runs as a scheduled background job. Each reservation is independently
    transitioned from 'reserved' to 'expired'.

    Returns the count of expired reservations.
    """
    execute = _execute if _execute is not None else _default_executor()

    result = await execute(
        """
        WITH expired AS (
            UPDATE ai_budget_reservations
            SET status = $1
            WHERE status = $2 AND expires_at < NOW()
            RETURNING id, budget_id, reserved_cost_micros
        )
        UPDATE ai_budgets
        SET reserved_micros = ai_budgets.reserved_micros - e.reserved_cost_micros
        FROM expired e
        WHERE ai_budgets.id = e.budget_id
        RETURNING e.id
        """,
        [ReservationStatus.EXPIRED.value, ReservationStatus.RESERVED.value],
    )

    return len(result[1])
