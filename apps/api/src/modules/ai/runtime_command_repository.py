from __future__ import annotations

from datetime import datetime
from typing import Literal, cast
from uuid import UUID

from pydantic import ConfigDict, TypeAdapter
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import (
    AgentApprovalV1Record,
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunEventV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
    AgentToolResponseV1Record,
)
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalOptionV1,
    ApprovalResolvedEventV1,
    ApprovalRiskV1,
    ApprovalV1,
    RunResumedEventV1,
)
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_tool_response_repository import AgentToolResponseRepository
from src.modules.ai.runtime_tool_response_schema import (
    PersistedAgentToolResponseV1,
    ToolResponseCommandV1,
)

_TOOL_RESPONSE_COMMAND_ADAPTER = TypeAdapter(ToolResponseCommandV1)


def _resume_response_tool_id(
    part_payload: object,
    response_kind: Literal["approval", "human_result"],
) -> str:
    if not isinstance(part_payload, dict):
        raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_CHECKPOINT_MISMATCH")
    tool_identity_key = "toolName" if response_kind == "approval" else "toolId"
    response_tool_id = part_payload.get(tool_identity_key)
    if not isinstance(response_tool_id, str) or not response_tool_id:
        raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_CHECKPOINT_MISMATCH")
    return response_tool_id


class AgentToolCallCommandScope(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    project_id: UUID | None
    thread_id: UUID
    run_id: UUID
    owner_user_id: UUID
    tool_call_id: str
    checkpoint_id: str
    correlation_id: str
    last_sequence: int
    approval: ApprovalV1 | None


class AgentRunResumeState(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    thread_id: UUID
    run_id: UUID
    job_id: UUID | None
    owner_user_id: UUID
    status: AgentRunStatusV1
    correlation_id: str
    last_sequence: int
    interrupt_id: str | None
    checkpoint_id: str | None
    interrupt_reason: str | None
    interrupt_approval_id: str | None
    interrupt_tool_call_id: str | None
    response_id: str
    response_kind: Literal["approval", "human_result"]
    response_checkpoint_id: str
    response_tool_call_id: str
    response_tool_id: str
    response_expected_sequence: int
    response_consumed_at: datetime | None


class AgentRuntimeCommandRepository(TortoiseORMRepository[AgentRunV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentRunV1Record)

    async def resolve_owned_tool_call(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        tool_call_id: str,
        checkpoint_id: str,
    ) -> AgentToolCallCommandScope:
        part = await AgentMessagePartV1Record.filter(tool_call_id=tool_call_id).first()
        if part is None or part.type != "tool-call":
            raise AgentRuntimePersistenceError("AGENT_TOOL_PART_NOT_FOUND")
        message = await AgentMessageV1Record.filter(id=part.message_id).first()
        if message is None:
            raise AgentRuntimePersistenceError("AGENT_TOOL_PART_NOT_FOUND")
        run = await AgentRunV1Record.filter(
            id=message.run_id,
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
        ).first()
        if run is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        thread_exists = await AgentThreadV1Record.filter(
            id=run.thread_id,
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            deleted_at=None,
        ).exists()
        if not thread_exists:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        approval_record = await AgentApprovalV1Record.filter(
            run_id=run.id,
            tool_call_id=tool_call_id,
            checkpoint_id=checkpoint_id,
        ).first()
        return AgentToolCallCommandScope(
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            thread_id=run.thread_id,
            run_id=run.id,
            owner_user_id=run.owner_user_id,
            tool_call_id=tool_call_id,
            checkpoint_id=checkpoint_id,
            correlation_id=run.correlation_id,
            last_sequence=run.last_sequence,
            approval=self._approval(approval_record),
        )

    async def get_response_command(
        self,
        *,
        response_id: str,
    ) -> ToolResponseCommandV1 | None:
        record = await AgentToolResponseV1Record.filter(response_id=response_id).first()
        if record is None:
            return None
        return _TOOL_RESPONSE_COMMAND_ADAPTER.validate_python(record.payload)

    async def get_response_command_by_idempotency(
        self,
        *,
        run_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
    ) -> ToolResponseCommandV1 | None:
        record = await AgentToolResponseV1Record.filter(
            run_id=run_id,
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
        ).first()
        if record is None:
            return None
        return _TOOL_RESPONSE_COMMAND_ADAPTER.validate_python(record.payload)

    async def get_resume_state_for_update(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        run_id: UUID,
        response_id: str,
        conn: BaseDBAsyncClient,
    ) -> AgentRunResumeState:
        run = await (
            AgentRunV1Record
            .filter(id=run_id, workspace_id=workspace_id, owner_user_id=owner_user_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if run is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        thread = await (
            AgentThreadV1Record
            .filter(
                id=run.thread_id,
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                deleted_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if thread is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        response = await (
            AgentToolResponseV1Record
            .filter(response_id=response_id, run_id=run.id, actor_user_id=owner_user_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if response is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_RESPONSE_MISSING")
        part = await (
            AgentMessagePartV1Record
            .filter(tool_call_id=response.tool_call_id, type="tool-call")
            .using_db(conn)
            .select_for_update()
            .first()
        )
        response_kind = cast(Literal["approval", "human_result"], str(response.kind))
        response_tool_id = _resume_response_tool_id(part.payload if part is not None else None, response_kind)
        return AgentRunResumeState(
            workspace_id=run.workspace_id,
            thread_id=run.thread_id,
            run_id=run.id,
            job_id=run.job_id,
            owner_user_id=run.owner_user_id,
            status=AgentRunStatusV1(run.status),
            correlation_id=run.correlation_id,
            last_sequence=run.last_sequence,
            interrupt_id=run.interrupt_id,
            checkpoint_id=run.checkpoint_id,
            interrupt_reason=run.interrupt_reason,
            interrupt_approval_id=run.interrupt_approval_id,
            interrupt_tool_call_id=run.interrupt_tool_call_id,
            response_id=response.response_id,
            response_kind=response_kind,
            response_checkpoint_id=response.checkpoint_id,
            response_tool_call_id=response.tool_call_id,
            response_tool_id=response_tool_id,
            response_expected_sequence=response.expected_sequence,
            response_consumed_at=response.consumed_at,
        )

    async def get_resumed_event(
        self,
        *,
        event_id: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> RunResumedEventV1 | None:
        record = await AgentRunEventV1Record.filter(event_id=event_id, type="run.resumed").using_db(conn).first()
        return RunResumedEventV1.model_validate(record.payload) if record is not None else None

    async def get_approval_resolved_event(self, *, event_id: str) -> ApprovalResolvedEventV1 | None:
        record = await AgentRunEventV1Record.filter(event_id=event_id, type="approval.resolved").first()
        return ApprovalResolvedEventV1.model_validate(record.payload) if record is not None else None

    async def get_persisted_response(self, *, response_id: str) -> PersistedAgentToolResponseV1 | None:
        record = await AgentToolResponseV1Record.filter(response_id=response_id).first()
        return AgentToolResponseRepository.to_persisted(record) if record is not None else None

    @staticmethod
    def _approval(record: AgentApprovalV1Record | None) -> ApprovalV1 | None:
        if record is None:
            return None
        return ApprovalV1(
            approval_id=record.approval_id,
            approval_version=record.approval_version,
            tool_call_id=record.tool_call_id,
            checkpoint_id=record.checkpoint_id,
            status=cast(Literal["pending", "approved", "rejected", "cancelled", "expired"], str(record.status)),
            requested_at=record.requested_at,
            expires_at=record.expires_at,
            policy_version=record.policy_version,
            risk=ApprovalRiskV1.model_validate(record.risk),
            options=tuple(ApprovalOptionV1.model_validate(option) for option in record.options),
        )
