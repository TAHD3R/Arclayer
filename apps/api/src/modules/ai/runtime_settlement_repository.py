from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import AgentRunV1Record
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus
from src.models.commerce.billing import CreditLedgerEntryType, WorkspaceCreditLedger
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError


class AgentRunSettlementProof(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True, strict=True)

    outcome: Literal["committed", "released", "reconciled"]
    reservation_count: int
    credit_reservation_count: int
    actual_cost_micros: int
    credits_committed: int
    credits_released: int


class AgentRunSettlementRepository(TortoiseORMRepository[AgentRunV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentRunV1Record)

    async def get_terminal_proof(self, *, run_id: UUID) -> AgentRunSettlementProof:
        """Read a locked proof used to construct a terminal event before append revalidates it."""

        async with in_transaction() as conn:
            return await self.get_terminal_proof_in_transaction(run_id=run_id, conn=conn)

    async def get_terminal_proof_in_transaction(
        self,
        *,
        run_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunSettlementProof:
        run = await AgentRunV1Record.filter(id=run_id).using_db(conn).select_for_update().first()
        if run is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        return await self.verify_terminal(run=run, conn=conn)

    async def verify_terminal(
        self,
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient,
    ) -> AgentRunSettlementProof:
        reservations = await (
            AIBudgetReservation
            .filter(agent_run_id=run.id)
            .using_db(conn)
            .select_for_update()
            .order_by("created_at", "id")
            .all()
        )
        committed_count = 0
        released_count = 0
        credit_count = 0
        actual_cost_micros = 0
        credits_committed = 0
        credits_released = 0
        for reservation in reservations:
            if reservation.status == ReservationStatus.RESERVED:
                raise AgentRuntimePersistenceError("AGENT_TERMINAL_SETTLEMENT_PENDING")
            if reservation.status == ReservationStatus.COMMITTED:
                committed_count += 1
                actual_cost_micros += self._require_committed_cost(reservation)
                if reservation.credit_account_id is not None:
                    credit_count += 1
                    credits_committed += await self._verify_credit_commit(
                        run=run,
                        reservation=reservation,
                        conn=conn,
                    )
                else:
                    self._require_no_credit_state(reservation)
                continue
            if reservation.status in {ReservationStatus.RELEASED, ReservationStatus.EXPIRED}:
                released_count += 1
                if reservation.credit_account_id is not None:
                    credit_count += 1
                    credits_released += await self._verify_credit_release(
                        run=run,
                        reservation=reservation,
                        conn=conn,
                    )
                else:
                    self._require_no_credit_state(reservation)
                continue
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_SETTLEMENT_INVALID")
        return AgentRunSettlementProof(
            outcome=self._outcome(committed=committed_count, released=released_count),
            reservation_count=len(reservations),
            credit_reservation_count=credit_count,
            actual_cost_micros=actual_cost_micros,
            credits_committed=credits_committed,
            credits_released=credits_released,
        )

    @staticmethod
    def _require_committed_cost(reservation: AIBudgetReservation) -> int:
        if reservation.actual_cost_micros is None or int(reservation.actual_cost_micros) < 0:
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_SETTLEMENT_INVALID")
        return int(reservation.actual_cost_micros)

    @staticmethod
    def _require_no_credit_state(reservation: AIBudgetReservation) -> None:
        if any(
            value is not None
            for value in (
                reservation.credit_value_micros,
                reservation.reserved_credits,
                reservation.actual_credits,
                reservation.credits_reconciled_at,
            )
        ):
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_PROOF_INVALID")

    async def _verify_credit_commit(
        self,
        *,
        run: AgentRunV1Record,
        reservation: AIBudgetReservation,
        conn: BaseDBAsyncClient,
    ) -> int:
        reserved, actual = self._require_reconciled_credit_values(reservation, require_actual=True)
        ledger = await (
            WorkspaceCreditLedger
            .filter(
                idempotency_key=f"ai-credit-commit:{reservation.request_id}",
            )
            .using_db(conn)
            .first()
        )
        if ledger is None or not self._matches_ledger_owner(run=run, reservation=reservation, ledger=ledger):
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_PROOF_MISSING")
        details = cast(JsonObject, ledger.details)
        if (
            ledger.entry_type != CreditLedgerEntryType.COMMIT
            or int(ledger.delta_balance_credits) != -actual
            or int(ledger.delta_reserved_credits) != -reserved
            or details.get("actualCostMicros") != int(reservation.actual_cost_micros or 0)
            or details.get("creditValueMicros") != int(reservation.credit_value_micros or 0)
            or details.get("reservedCredits") != reserved
            or details.get("actualCredits") != actual
        ):
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_PROOF_INVALID")
        return actual

    async def _verify_credit_release(
        self,
        *,
        run: AgentRunV1Record,
        reservation: AIBudgetReservation,
        conn: BaseDBAsyncClient,
    ) -> int:
        reserved, _ = self._require_reconciled_credit_values(reservation, require_actual=False)
        ledgers = await (
            WorkspaceCreditLedger
            .filter(
                account_id=reservation.credit_account_id,
                reference_type="ai_request",
                reference_id=reservation.request_id,
                entry_type__in=(CreditLedgerEntryType.RELEASE, CreditLedgerEntryType.EXPIRATION),
            )
            .using_db(conn)
            .all()
        )
        if len(ledgers) != 1 or not self._matches_ledger_owner(
            run=run,
            reservation=reservation,
            ledger=ledgers[0],
        ):
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_PROOF_MISSING")
        ledger = ledgers[0]
        expected_type = (
            CreditLedgerEntryType.EXPIRATION
            if reservation.status == ReservationStatus.EXPIRED
            else CreditLedgerEntryType.RELEASE
        )
        if (
            ledger.entry_type != expected_type
            or int(ledger.delta_balance_credits) != 0
            or int(ledger.delta_reserved_credits) != -reserved
            or cast(JsonObject, ledger.details).get("reservedCredits") != reserved
        ):
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_PROOF_INVALID")
        return reserved

    @staticmethod
    def _require_reconciled_credit_values(
        reservation: AIBudgetReservation,
        *,
        require_actual: bool,
    ) -> tuple[int, int]:
        if (
            reservation.credit_value_micros is None
            or int(reservation.credit_value_micros) <= 0
            or reservation.reserved_credits is None
            or int(reservation.reserved_credits) < 0
            or reservation.credits_reconciled_at is None
        ):
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_PROOF_INVALID")
        if require_actual and reservation.actual_credits is None:
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_PROOF_INVALID")
        if not require_actual and reservation.actual_credits is not None:
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_PROOF_INVALID")
        actual = int(reservation.actual_credits or 0)
        reserved = int(reservation.reserved_credits)
        if actual < 0 or actual > reserved:
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_PROOF_INVALID")
        return reserved, actual

    @staticmethod
    def _matches_ledger_owner(
        *,
        run: AgentRunV1Record,
        reservation: AIBudgetReservation,
        ledger: WorkspaceCreditLedger,
    ) -> bool:
        return (
            ledger.workspace_id == run.workspace_id
            and ledger.account_id == reservation.credit_account_id
            and ledger.reference_type == "ai_request"
            and ledger.reference_id == reservation.request_id
        )

    @staticmethod
    def _outcome(*, committed: int, released: int) -> Literal["committed", "released", "reconciled"]:
        if committed and not released:
            return "committed"
        if released and not committed:
            return "released"
        return "reconciled"
