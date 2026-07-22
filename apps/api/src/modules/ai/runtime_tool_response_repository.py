from __future__ import annotations

from typing import Literal, cast

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentToolResponseKindV1,
    AgentToolResponseV1Record,
)
from src.modules.ai.runtime_approval_protocol_schema import ApprovalResolvedEventV1
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_tool_response_schema import (
    ApprovalToolResponseCommandV1,
    HumanToolResultResponseCommandV1,
    PersistedAgentToolResponseV1,
    ToolResponseCommandV1,
)


class AgentToolResponseRepository(TortoiseORMRepository[AgentToolResponseV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentToolResponseV1Record)

    async def record_human_result(
        self,
        *,
        command: HumanToolResultResponseCommandV1,
    ) -> PersistedAgentToolResponseV1:
        async with in_transaction() as conn:
            run = await self._get_locked_run(command=command, conn=conn)
            existing = await self.get_idempotent(command=command, conn=conn)
            if existing is not None:
                self.validate_exact(existing=existing, command=command)
                return self.to_persisted(existing)
            self._validate_human_interrupt(run=run, command=command)
            await self._ensure_response_id_available(command=command, conn=conn)
            active = await (
                AgentToolResponseV1Record
                .filter(
                    run_id=run.id,
                    tool_call_id=command.tool_call_id,
                    checkpoint_id=command.checkpoint_id,
                    kind=AgentToolResponseKindV1.HUMAN_RESULT,
                    consumed_at=None,
                )
                .using_db(conn)
                .exists()
            )
            if active:
                raise AgentRuntimePersistenceError("AGENT_TOOL_RESULT_ALREADY_RECORDED")
            record = await self.create_for_command(
                run=run,
                command=command,
                approval=None,
                expected_sequence=run.last_sequence,
                conn=conn,
            )
            return self.to_persisted(record)

    async def get_idempotent(
        self,
        *,
        command: ToolResponseCommandV1,
        conn: BaseDBAsyncClient,
    ) -> AgentToolResponseV1Record | None:
        return await (
            AgentToolResponseV1Record
            .filter(
                run_id=command.run_id,
                actor_user_id=command.actor_user_id,
                idempotency_key=command.idempotency_key,
            )
            .using_db(conn)
            .first()
        )

    async def create_approval_response(
        self,
        *,
        run: AgentRunV1Record,
        command: ApprovalToolResponseCommandV1,
        event: ApprovalResolvedEventV1,
        conn: BaseDBAsyncClient,
    ) -> AgentToolResponseV1Record:
        self.validate_scope(run=run, command=command)
        approval = await (
            AgentApprovalV1Record
            .filter(approval_id=command.approval_id, run_id=run.id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if approval is None:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_NOT_FOUND")
        self._validate_approval_decision(run=run, approval=approval, command=command, event=event)
        await self._ensure_response_id_available(command=command, conn=conn)
        option_id = self._resolve_option_id(approval=approval, command=command)
        approval.selected_option_id = option_id
        approval.resolution_reason = command.reason
        await approval.save(
            update_fields=["selected_option_id", "resolution_reason", "updated_at"],
            using_db=conn,
        )
        return await self.create_for_command(
            run=run,
            command=command,
            approval=approval,
            expected_sequence=event.sequence,
            conn=conn,
        )

    async def create_for_command(
        self,
        *,
        run: AgentRunV1Record,
        command: ToolResponseCommandV1,
        approval: AgentApprovalV1Record | None,
        expected_sequence: int,
        conn: BaseDBAsyncClient,
    ) -> AgentToolResponseV1Record:
        return await self.create_record(
            AgentToolResponseV1Record,
            conn=conn,
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            thread_id=run.thread_id,
            run_id=run.id,
            approval_id=approval.id if approval is not None else None,
            actor_user_id=command.actor_user_id,
            response_id=command.response_id,
            kind=command.kind,
            tool_call_id=command.tool_call_id,
            checkpoint_id=command.checkpoint_id,
            idempotency_key=command.idempotency_key,
            expected_sequence=expected_sequence,
            payload=command.model_dump(by_alias=True, mode="json"),
        )

    @staticmethod
    async def _get_locked_run(
        *,
        command: ToolResponseCommandV1,
        conn: BaseDBAsyncClient,
    ) -> AgentRunV1Record:
        run = await AgentRunV1Record.filter(id=command.run_id).using_db(conn).select_for_update().first()
        if run is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        AgentToolResponseRepository.validate_scope(run=run, command=command)
        return run

    @staticmethod
    def validate_scope(*, run: AgentRunV1Record, command: ToolResponseCommandV1) -> None:
        if (
            run.workspace_id != command.workspace_id
            or run.project_id != command.project_id
            or run.thread_id != command.thread_id
            or run.owner_user_id != command.actor_user_id
        ):
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")

    @staticmethod
    def _validate_human_interrupt(
        *,
        run: AgentRunV1Record,
        command: HumanToolResultResponseCommandV1,
    ) -> None:
        if (
            run.status != AgentRunStatusV1.INTERRUPTED
            or run.interrupt_reason != "human_tool_input"
            or run.interrupt_approval_id is not None
            or run.interrupt_tool_call_id != command.tool_call_id
            or run.checkpoint_id != command.checkpoint_id
        ):
            raise AgentRuntimePersistenceError("AGENT_TOOL_RESULT_NOT_PENDING")

    @staticmethod
    def _validate_approval_decision(
        *,
        run: AgentRunV1Record,
        approval: AgentApprovalV1Record,
        command: ApprovalToolResponseCommandV1,
        event: ApprovalResolvedEventV1,
    ) -> None:
        projection = event.data.approval
        expected_status = "approved" if command.approved else "rejected"
        if approval.status != AgentApprovalStatusV1.PENDING:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_ALREADY_RESOLVED")
        if approval.approval_version != command.approval_version:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_VERSION_CONFLICT")
        if command.responded_at >= approval.expires_at:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_EXPIRED")
        if (
            run.status != AgentRunStatusV1.INTERRUPTED
            or run.interrupt_reason != "approval_required"
            or run.interrupt_approval_id != command.approval_id
            or run.interrupt_tool_call_id != command.tool_call_id
            or run.checkpoint_id != command.checkpoint_id
            or event.run_id != str(run.id)
            or event.thread_id != str(run.thread_id)
            or event.data.resolved_at != command.responded_at
            or event.data.resolved_by_actor_id != str(command.actor_user_id)
            or projection.approval_id != command.approval_id
            or projection.approval_version != command.approval_version
            or projection.tool_call_id != command.tool_call_id
            or projection.checkpoint_id != command.checkpoint_id
            or projection.status != expected_status
        ):
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_CONTRACT_MISMATCH")

    @staticmethod
    def _resolve_option_id(
        *,
        approval: AgentApprovalV1Record,
        command: ApprovalToolResponseCommandV1,
    ) -> str:
        compatible_kinds = {"allow-once", "allow-always"} if command.approved else {"reject-once", "reject-always"}
        options = [cast(JsonObject, option) for option in cast(list[object], approval.options)]
        compatible = [option for option in options if option.get("kind") in compatible_kinds]
        if command.option_id is None:
            if len(compatible) != 1:
                raise AgentRuntimePersistenceError("AGENT_APPROVAL_OPTION_REQUIRED")
            return cast(str, compatible[0]["id"])
        selected = next((option for option in compatible if option.get("id") == command.option_id), None)
        if selected is None:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_OPTION_INVALID")
        return command.option_id

    @staticmethod
    async def _ensure_response_id_available(
        *,
        command: ToolResponseCommandV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if await AgentToolResponseV1Record.filter(response_id=command.response_id).using_db(conn).exists():
            raise AgentRuntimePersistenceError("AGENT_TOOL_RESPONSE_ID_REUSED")

    @staticmethod
    def validate_exact(*, existing: AgentToolResponseV1Record, command: ToolResponseCommandV1) -> None:
        if cast(JsonObject, existing.payload) != command.model_dump(by_alias=True, mode="json"):
            raise AgentRuntimePersistenceError("AGENT_TOOL_RESPONSE_IDEMPOTENCY_CONFLICT")

    @staticmethod
    def to_persisted(record: AgentToolResponseV1Record) -> PersistedAgentToolResponseV1:
        return PersistedAgentToolResponseV1(
            response_id=record.response_id,
            kind=cast(Literal["approval", "human_result"], str(record.kind)),
            run_id=record.run_id,
            tool_call_id=record.tool_call_id,
            checkpoint_id=record.checkpoint_id,
            expected_sequence=record.expected_sequence,
            consumed_at=record.consumed_at,
        )
