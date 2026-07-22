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


class ReservationRequestConflictError(Exception):
    """Raised when one request id is reused with different reservation inputs."""

    def __init__(self, request_id: UUID) -> None:
        self.request_id = request_id
        super().__init__(f"Reservation request {request_id} was reused with different inputs")


class ReservationRunScopeError(Exception):
    """Raised when a reservation cannot be owned by the requested Agent Run."""


def _reservation_advisory_lock_key(request_id: UUID) -> int:
    """Map a request UUID to a signed Postgres advisory-transaction lock key."""

    return int.from_bytes(request_id.bytes[:8], byteorder="big", signed=True)


def _affected_rows(result: Any) -> int:
    """Return affected row count for real asyncpg and unit-test executor shapes."""
    if isinstance(result, tuple) and result:
        first = result[0]
        if isinstance(first, int):
            return first
        if len(result) > 1 and isinstance(result[1], list):
            return len(result[1])
    return 0


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
    workspace_id: UUID | None = None,
    agent_run_id: UUID | None = None,
    ttl_seconds: int = 300,
    _execute: QueryExecutor | None = None,
) -> AIBudgetReservation:
    """Atomically reserve budget for an LLM call.

    Uses a transaction-scoped request lock plus UPDATE...RETURNING to prevent
    both duplicate request reservations and budget overspend under concurrency.
    """
    reserve_amount = estimated_cost_micros

    async def _perform(executor: QueryExecutor, conn: Any) -> AIBudgetReservation:
        if conn is not None:
            existing = await AIBudgetReservation.get_or_none(request_id=request_id, using_db=conn)
            if existing is not None:
                same_request = (
                    UUID(str(existing.budget_id)) == budget_id
                    and int(existing.estimated_cost_micros) == estimated_cost_micros
                    and existing.agent_run_id == agent_run_id
                )
                if not same_request:
                    raise ReservationRequestConflictError(request_id)
                return existing

        if agent_run_id is not None:
            if conn is None or workspace_id is None:
                raise ReservationRunScopeError("Agent Run reservations require a transactional workspace scope")
            from src.models.agents.runtime_v1 import AgentRunStatusV1, AgentRunV1Record

            agent_run = await AgentRunV1Record.filter(id=agent_run_id).using_db(conn).select_for_update().first()
            if agent_run is None or agent_run.workspace_id != workspace_id:
                raise ReservationRunScopeError(f"Agent Run {agent_run_id} does not belong to Workspace {workspace_id}")
            if agent_run.status not in {
                AgentRunStatusV1.CREATED,
                AgentRunStatusV1.QUEUED,
                AgentRunStatusV1.RUNNING,
                AgentRunStatusV1.INTERRUPTED,
            }:
                raise ReservationRunScopeError(
                    f"Agent Run {agent_run_id} cannot create a reservation from status {agent_run.status}"
                )

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

        if _affected_rows(result) == 0:
            budget = await AIBudget.get(id=budget_id)
            available = budget.limit_micros - budget.spent_micros - budget.reserved_micros
            raise BudgetExceededError(
                budget_id=budget_id,
                available_micros=max(available, 0),
                requested_micros=reserve_amount,
            )

        credit_account_id = None
        credit_value_micros = None
        reserved_credits = None
        if workspace_id is not None:
            if conn is None:
                raise RuntimeError("workspace credit reservations require a database transaction")
            from src.config import get_settings
            from src.modules.commerce.credits import reserve_workspace_credits

            credit_details = await reserve_workspace_credits(
                settings=get_settings(),
                conn=conn,
                workspace_id=workspace_id,
                request_id=request_id,
                estimated_cost_micros=estimated_cost_micros,
            )
            credit_account_id = credit_details.account_id
            credit_value_micros = credit_details.credit_value_micros
            reserved_credits = credit_details.reserved_credits

        expires_at = datetime.now(UTC) + timedelta(seconds=ttl_seconds)
        reservation = await AIBudgetReservation.create(
            id=uuid.uuid4(),
            budget_id=budget_id,
            agent_run_id=agent_run_id,
            request_id=request_id,
            estimated_cost_micros=estimated_cost_micros,
            reserved_cost_micros=reserve_amount,
            credit_account_id=credit_account_id,
            credit_value_micros=credit_value_micros,
            reserved_credits=reserved_credits,
            status=ReservationStatus.RESERVED,
            expires_at=expires_at,
            using_db=conn,
        )
        return reservation

    if _execute is not None:
        return await _perform(_execute, None)

    from tortoise.transactions import in_transaction as _tx

    async with _tx() as conn:
        await conn.execute_query(
            "SELECT pg_advisory_xact_lock($1)",
            [_reservation_advisory_lock_key(request_id)],
        )
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

    async def _perform(executor: QueryExecutor, conn: Any, *, integrate_credits: bool) -> None:
        result = await executor(
            """
            UPDATE ai_budget_reservations
            SET status = $1, actual_cost_micros = $2
            WHERE id = $3 AND status = $4
            RETURNING id, reserved_cost_micros
            """,
            [ReservationStatus.COMMITTED.value, actual_cost_micros, reservation_id, ReservationStatus.RESERVED.value],
        )

        if _affected_rows(result) == 0:
            existing = await AIBudgetReservation.get_or_none(id=reservation_id, using_db=conn)
            if existing is None:
                raise ReservationNotFoundError(f"Reservation {reservation_id} not found")
            if existing.status == ReservationStatus.COMMITTED:
                return  # Idempotent.
            raise ReservationStatusError(
                reservation_id=reservation_id,
                current_status=existing.status.value,
                target_status=ReservationStatus.COMMITTED.value,
            )

        await executor(
            """
            UPDATE ai_budgets
            SET reserved_micros = reserved_micros - (
                    SELECT reserved_cost_micros FROM ai_budget_reservations WHERE id = $2
                ),
                spent_micros = spent_micros + $1
            WHERE id = (SELECT budget_id FROM ai_budget_reservations WHERE id = $2)
            """,
            [actual_cost_micros, reservation_id],
        )

        if integrate_credits:
            from src.config import get_settings
            from src.modules.commerce.credits import commit_workspace_credits

            reservation = await AIBudgetReservation.get(id=reservation_id, using_db=conn)
            await commit_workspace_credits(
                settings=get_settings(),
                conn=conn,
                reservation=reservation,
                actual_cost_micros=actual_cost_micros,
            )

    if _execute is not None:
        return await _perform(_execute, None, integrate_credits=False)

    from tortoise.transactions import in_transaction as _tx_fn

    async with _tx_fn() as conn:
        return await _perform(conn.execute_query, conn, integrate_credits=True)


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

    async def _perform(executor: QueryExecutor, conn: Any, *, integrate_credits: bool) -> None:
        result = await executor(
            """
            UPDATE ai_budget_reservations
            SET status = $1
            WHERE id = $2 AND status = $3
            RETURNING id, reserved_cost_micros
            """,
            [ReservationStatus.RELEASED.value, reservation_id, ReservationStatus.RESERVED.value],
        )

        if _affected_rows(result) == 0:
            existing = await AIBudgetReservation.get_or_none(id=reservation_id, using_db=conn)
            if existing is None:
                raise ReservationNotFoundError(f"Reservation {reservation_id} not found")
            if existing.status == ReservationStatus.RELEASED:
                return  # Idempotent.
            raise ReservationStatusError(
                reservation_id=reservation_id,
                current_status=existing.status.value,
                target_status=ReservationStatus.RELEASED.value,
            )

        await executor(
            """
            UPDATE ai_budgets
            SET reserved_micros = reserved_micros - (
                SELECT reserved_cost_micros FROM ai_budget_reservations WHERE id = $1
            )
            WHERE id = (SELECT budget_id FROM ai_budget_reservations WHERE id = $1)
            """,
            [reservation_id],
        )

        if integrate_credits:
            from src.config import get_settings
            from src.modules.commerce.credits import release_workspace_credits

            reservation = await AIBudgetReservation.get(id=reservation_id, using_db=conn)
            await release_workspace_credits(
                settings=get_settings(),
                conn=conn,
                reservation=reservation,
                reason="provider_request_released",
            )

    if _execute is not None:
        return await _perform(_execute, None, integrate_credits=False)

    from tortoise.transactions import in_transaction as _tx_fn

    async with _tx_fn() as conn:
        return await _perform(conn.execute_query, conn, integrate_credits=True)


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
        ), expired_by_budget AS (
            SELECT budget_id, SUM(reserved_cost_micros) AS reserved_cost_micros
            FROM expired
            GROUP BY budget_id
        ), updated_budgets AS (
            UPDATE ai_budgets
            SET reserved_micros = ai_budgets.reserved_micros - e.reserved_cost_micros
            FROM expired_by_budget e
            WHERE ai_budgets.id = e.budget_id
            RETURNING ai_budgets.id
        )
        SELECT id FROM expired
        """,
        [ReservationStatus.EXPIRED.value, ReservationStatus.RESERVED.value],
    )

    expired_count = _affected_rows(result)
    if _execute is None:
        await _release_expired_credit_holds()
    return expired_count


async def _release_expired_credit_holds() -> None:
    """Reconcile credit holds for reservations just transitioned to expired."""

    from tortoise.transactions import in_transaction

    from src.config import get_settings
    from src.models.commerce.billing import CreditLedgerEntryType
    from src.modules.commerce.credits import release_workspace_credits

    reservation_ids = await AIBudgetReservation.filter(
        status=ReservationStatus.EXPIRED,
        credit_account_id__not_isnull=True,
        credits_reconciled_at__isnull=True,
    ).values_list("id", flat=True)
    for reservation_id in reservation_ids:
        async with in_transaction() as conn:
            reservation = (
                await AIBudgetReservation
                .filter(
                    id=reservation_id,
                    status=ReservationStatus.EXPIRED,
                    credits_reconciled_at__isnull=True,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if reservation is None:
                continue
            await release_workspace_credits(
                settings=get_settings(),
                conn=conn,
                reservation=reservation,
                reason="reservation_expired",
                entry_type=CreditLedgerEntryType.EXPIRATION,
            )
