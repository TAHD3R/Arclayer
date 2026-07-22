from __future__ import annotations

from decimal import Decimal
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_delegation_v1 import AgentDelegationStatusV1, AgentDelegationV1Record
from src.models.agents.runtime_output_v1 import AgentChangeSetV1Record
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunV1Record,
)
from src.modules.ai.runtime_output_protocol_schema import (
    ChangeSetProposedEventV1,
    RunCancelledEventV1,
    RunCompletedEventV1,
    RunFailedEventV1,
    RunOutputProjectionEventV1,
    UsageUpdatedEventV1,
    UsageV1,
)
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_settlement_repository import (
    AgentRunSettlementProof,
    AgentRunSettlementRepository,
)

PART_TERMINAL_STATUSES = {"complete", "incomplete", "failed"}


class AgentRunOutputProjectionRepository(TortoiseORMRepository[AgentRunV1Record]):
    def __init__(
        self,
        *,
        settlement_repository: AgentRunSettlementRepository | None = None,
    ) -> None:
        super().__init__(AgentRunV1Record)
        self._settlement_repository = settlement_repository or AgentRunSettlementRepository()

    async def project(
        self,
        *,
        run: AgentRunV1Record,
        event: RunOutputProjectionEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if isinstance(event, UsageUpdatedEventV1):
            await self._update_usage(run=run, event=event, conn=conn)
        elif isinstance(event, ChangeSetProposedEventV1):
            await self._propose_change_set(run=run, event=event, conn=conn)
        else:
            await self._terminal(run=run, event=event, conn=conn)

    async def _update_usage(
        self,
        *,
        run: AgentRunV1Record,
        event: UsageUpdatedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        current = cast(JsonObject | None, run.usage)
        projected = event.data.usage.model_dump(by_alias=True, mode="json")
        if current is not None:
            self._validate_usage_identity(current=current, projected=event.data.usage)
        run.usage = projected
        await run.save(update_fields=["usage", "updated_at"], using_db=conn)

    async def _propose_change_set(
        self,
        *,
        run: AgentRunV1Record,
        event: ChangeSetProposedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        data = event.data
        await self.create_record(
            AgentChangeSetV1Record,
            conn=conn,
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            thread_id=run.thread_id,
            run_id=run.id,
            change_set_id=data.change_set_id,
            base_revision_id=data.base_revision_id,
            preview_ref=data.preview_ref,
            summary_key=data.summary_key,
            summary_params=data.summary_params,
            warnings=[item.model_dump(by_alias=True, mode="json") for item in data.warnings],
            required_approval_ids=list(data.required_approval_ids),
        )

    async def _terminal(
        self,
        *,
        run: AgentRunV1Record,
        event: RunCompletedEventV1 | RunCancelledEventV1 | RunFailedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._require_no_open_authority(run=run, conn=conn)
        proof = await self._settlement_repository.verify_terminal(run=run, conn=conn)
        if isinstance(event, RunCompletedEventV1):
            await self._complete(run=run, event=event, proof=proof, conn=conn)
            return
        self._validate_terminal_settlement(
            run=run,
            usage=event.data.settlement.usage,
            outcome=event.data.settlement.outcome,
            credits_committed=event.data.settlement.credits_committed,
            credits_released=event.data.settlement.credits_released,
            proof=proof,
        )
        await self._finalize_incomplete_parts(run=run, part_ids=event.data.incomplete_part_ids, conn=conn)
        run.settlement = self._settlement_payload(
            proof=proof,
            usage=event.data.settlement.usage,
        )
        update_fields = ["settlement", "error", "updated_at"]
        if event.data.settlement.usage is not None:
            run.usage = event.data.settlement.usage.model_dump(by_alias=True, mode="json")
            update_fields.append("usage")
        if isinstance(event, RunFailedEventV1):
            run.error = cast(JsonValue, event.data.error.model_dump(by_alias=True, mode="json"))
        await run.save(update_fields=update_fields, using_db=conn)

    async def _complete(
        self,
        *,
        run: AgentRunV1Record,
        event: RunCompletedEventV1,
        proof: AgentRunSettlementProof,
        conn: BaseDBAsyncClient,
    ) -> None:
        try:
            message_id = UUID(event.data.assistant_message_id)
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_MESSAGE_INVALID") from error
        message = await AgentMessageV1Record.filter(id=message_id, run_id=run.id).using_db(conn).first()
        if message is None or message.role != "assistant" or message.status != "complete":
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_MESSAGE_INVALID")
        message_ids = await AgentMessageV1Record.filter(run_id=run.id).using_db(conn).values_list("id", flat=True)
        parts = await AgentMessagePartV1Record.filter(message_id__in=message_ids).using_db(conn)
        if any(part.status not in PART_TERMINAL_STATUSES for part in parts):
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_PARTS_RUNNING")
        current = cast(JsonObject | None, run.usage)
        if current is None:
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_USAGE_MISSING")
        self._validate_committed_usage(current=current, committed=event.data.usage)
        self._validate_usage_proof(usage=event.data.usage, proof=proof)
        run.usage = event.data.usage.model_dump(by_alias=True, mode="json")
        run.settlement = self._settlement_payload(proof=proof, usage=event.data.usage)
        await run.save(update_fields=["usage", "settlement", "updated_at"], using_db=conn)

    @classmethod
    def _validate_terminal_settlement(
        cls,
        *,
        run: AgentRunV1Record,
        usage: UsageV1 | None,
        outcome: str,
        credits_committed: str,
        credits_released: str,
        proof: AgentRunSettlementProof,
    ) -> None:
        if (
            outcome != proof.outcome
            or Decimal(credits_committed) != proof.credits_committed
            or Decimal(credits_released) != proof.credits_released
        ):
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_SETTLEMENT_MISMATCH")
        current = cast(JsonObject | None, run.usage)
        if usage is None:
            if current is not None:
                raise AgentRuntimePersistenceError("AGENT_TERMINAL_USAGE_MISSING")
            return
        if current is not None:
            cls._validate_committed_usage(current=current, committed=usage)
        cls._validate_usage_proof(usage=usage, proof=proof)

    @staticmethod
    def _validate_usage_proof(*, usage: UsageV1, proof: AgentRunSettlementProof) -> None:
        committed_credits = Decimal(proof.credits_committed)
        if proof.credit_reservation_count:
            if usage.credits is None or Decimal(usage.credits) != committed_credits:
                raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_USAGE_MISMATCH")
        elif usage.credits is not None and Decimal(usage.credits) != 0:
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_CREDIT_USAGE_MISMATCH")
        if proof.reservation_count and usage.provider_cost is not None:
            cost_micros = Decimal(usage.provider_cost) * Decimal(1_000_000)
            if usage.currency != "USD" or cost_micros != cost_micros.to_integral_value():
                raise AgentRuntimePersistenceError("AGENT_TERMINAL_PROVIDER_COST_MISMATCH")
            if int(cost_micros) != proof.actual_cost_micros:
                raise AgentRuntimePersistenceError("AGENT_TERMINAL_PROVIDER_COST_MISMATCH")

    @staticmethod
    def _settlement_payload(
        *,
        proof: AgentRunSettlementProof,
        usage: UsageV1 | None,
    ) -> JsonObject:
        return {
            "outcome": proof.outcome,
            "usage": usage.model_dump(by_alias=True, mode="json") if usage is not None else None,
            "creditsCommitted": str(proof.credits_committed),
            "creditsReleased": str(proof.credits_released),
        }

    @staticmethod
    async def _require_no_open_authority(*, run: AgentRunV1Record, conn: BaseDBAsyncClient) -> None:
        active_delegation = (
            await AgentDelegationV1Record
            .filter(
                parent_run_id=run.id,
                status=AgentDelegationStatusV1.DELEGATED,
            )
            .using_db(conn)
            .exists()
        )
        pending_approval = (
            await AgentApprovalV1Record
            .filter(
                run_id=run.id,
                status=AgentApprovalStatusV1.PENDING,
            )
            .using_db(conn)
            .exists()
        )
        if active_delegation or pending_approval:
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_AUTHORITY_PENDING")

    @staticmethod
    async def _finalize_incomplete_parts(
        *,
        run: AgentRunV1Record,
        part_ids: tuple[str, ...],
        conn: BaseDBAsyncClient,
    ) -> None:
        message_ids = await AgentMessageV1Record.filter(run_id=run.id).using_db(conn).values_list("id", flat=True)
        running_parts = await (
            AgentMessagePartV1Record
            .filter(
                message_id__in=message_ids,
                status__in=("running", "requires_action"),
            )
            .using_db(conn)
            .select_for_update()
            .all()
        )
        if {str(part.id) for part in running_parts} != set(part_ids) or len(part_ids) != len(set(part_ids)):
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_INCOMPLETE_PARTS_MISMATCH")
        message_ids: set[UUID] = set()
        for part in running_parts:
            part.status = "incomplete"
            part.payload = {**cast(JsonObject, part.payload), "status": "incomplete"}
            message_ids.add(part.message_id)
            await part.save(update_fields=["status", "payload", "updated_at"], using_db=conn)
        if message_ids:
            await AgentMessageV1Record.filter(id__in=message_ids).using_db(conn).update(status="incomplete")

    @staticmethod
    def _validate_usage_identity(*, current: JsonObject, projected: UsageV1) -> None:
        for key in ("provider", "model", "currency"):
            if current.get(key) is not None and getattr(projected, _snake(key)) != current.get(key):
                raise AgentRuntimePersistenceError("AGENT_USAGE_IDENTITY_MISMATCH")
        for key in ("inputTokens", "outputTokens", "totalTokens"):
            previous = current.get(key)
            current_value = getattr(projected, _snake(key))
            if isinstance(previous, int) and (current_value is None or current_value < previous):
                raise AgentRuntimePersistenceError("AGENT_USAGE_REGRESSION")
        for key in ("providerCost", "credits"):
            previous = current.get(key)
            current_value = getattr(projected, _snake(key))
            if isinstance(previous, str) and (current_value is None or Decimal(current_value) < Decimal(previous)):
                raise AgentRuntimePersistenceError("AGENT_USAGE_REGRESSION")

    @classmethod
    def _validate_committed_usage(cls, *, current: JsonObject, committed: UsageV1) -> None:
        cls._validate_usage_identity(current=current, projected=committed)
        comparable = committed.model_dump(by_alias=True, mode="json")
        comparable["settlement"] = "provisional"
        if comparable != current:
            raise AgentRuntimePersistenceError("AGENT_TERMINAL_USAGE_MISMATCH")


def _snake(alias: str) -> str:
    aliases = {
        "inputTokens": "input_tokens",
        "outputTokens": "output_tokens",
        "totalTokens": "total_tokens",
        "providerCost": "provider_cost",
    }
    return aliases.get(alias, alias)
