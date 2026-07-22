from __future__ import annotations

from typing import cast

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunEventV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentToolResponseKindV1,
    AgentToolResponseV1Record,
)
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalProjectionEventV1,
    InterruptProjectionEventV1,
    RunInterruptedEventV1,
    RunResumedEventV1,
)
from src.modules.ai.runtime_delegation_protocol_schema import DelegationProjectionEventV1
from src.modules.ai.runtime_message_repository import MessageProjectionEventV1
from src.modules.ai.runtime_output_protocol_schema import (
    RunCancelledEventV1,
    RunCompletedEventV1,
    RunFailedEventV1,
    RunOutputProjectionEventV1,
)
from src.modules.ai.runtime_protocol_schema import (
    RunCancelRequestedEventV1,
    RunCreatedEventV1,
    RunQueuedEventV1,
    RunStartedEventV1,
)
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_tool_repository import ToolProjectionEventV1

RunLifecycleEventV1 = (
    RunQueuedEventV1
    | RunStartedEventV1
    | RunCancelRequestedEventV1
    | MessageProjectionEventV1
    | ToolProjectionEventV1
    | ApprovalProjectionEventV1
    | InterruptProjectionEventV1
    | DelegationProjectionEventV1
    | RunOutputProjectionEventV1
)
RunHeadEventV1 = RunCreatedEventV1 | RunLifecycleEventV1


class AgentRunLifecycleRepository(TortoiseORMRepository[AgentRunV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentRunV1Record)

    async def validate_before_append(
        self,
        *,
        run: AgentRunV1Record,
        event: RunLifecycleEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._validate_required_interrupt(run=run, event=event, conn=conn)
        if isinstance(event, RunInterruptedEventV1) and event.data.reason == "human_tool_input":
            await self._require_human_tool_part(run=run, event=event, conn=conn)
        allowed_statuses = {
            "run.queued": {AgentRunStatusV1.CREATED},
            "run.started": {AgentRunStatusV1.CREATED, AgentRunStatusV1.QUEUED, AgentRunStatusV1.RUNNING},
            "run.cancel.requested": {
                AgentRunStatusV1.CREATED,
                AgentRunStatusV1.QUEUED,
                AgentRunStatusV1.RUNNING,
                AgentRunStatusV1.INTERRUPTED,
            },
            "message.part.started": {AgentRunStatusV1.RUNNING},
            "message.part.delta": {AgentRunStatusV1.RUNNING},
            "message.part.completed": {AgentRunStatusV1.RUNNING, AgentRunStatusV1.CANCELLATION_REQUESTED},
            "tool.started": {AgentRunStatusV1.RUNNING},
            "tool.progress": {AgentRunStatusV1.RUNNING, AgentRunStatusV1.CANCELLATION_REQUESTED},
            "tool.completed": {AgentRunStatusV1.RUNNING, AgentRunStatusV1.CANCELLATION_REQUESTED},
            "tool.failed": {AgentRunStatusV1.RUNNING, AgentRunStatusV1.CANCELLATION_REQUESTED},
            "approval.required": {AgentRunStatusV1.RUNNING},
            "run.interrupted": {AgentRunStatusV1.RUNNING},
            "approval.resolved": {AgentRunStatusV1.INTERRUPTED, AgentRunStatusV1.CANCELLATION_REQUESTED},
            "run.resumed": {AgentRunStatusV1.INTERRUPTED},
            "delegation.delegated": {AgentRunStatusV1.RUNNING},
            "delegation.completed": {AgentRunStatusV1.RUNNING, AgentRunStatusV1.CANCELLATION_REQUESTED},
            "delegation.failed": {AgentRunStatusV1.RUNNING, AgentRunStatusV1.CANCELLATION_REQUESTED},
            "usage.updated": {AgentRunStatusV1.RUNNING, AgentRunStatusV1.CANCELLATION_REQUESTED},
            "changeset.proposed": {AgentRunStatusV1.RUNNING},
            "run.completed": {AgentRunStatusV1.RUNNING},
            "run.cancelled": {AgentRunStatusV1.CANCELLATION_REQUESTED},
            "run.failed": {
                AgentRunStatusV1.CREATED,
                AgentRunStatusV1.QUEUED,
                AgentRunStatusV1.RUNNING,
                AgentRunStatusV1.CANCELLATION_REQUESTED,
                AgentRunStatusV1.INTERRUPTED,
            },
        }
        if run.status not in allowed_statuses[event.type]:
            raise AgentRuntimePersistenceError("AGENT_EVENT_TRANSITION_INVALID")

    async def advance_head(
        self,
        *,
        run: AgentRunV1Record,
        event: RunHeadEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        run.last_sequence = event.sequence
        run.last_cursor = event.cursor
        update_fields = ["last_sequence", "last_cursor", "status", "updated_at"]
        if event.type == "run.queued":
            run.status = AgentRunStatusV1.QUEUED
        elif event.type == "run.started":
            run.status = AgentRunStatusV1.RUNNING
        elif isinstance(event, RunCancelRequestedEventV1):
            run.status = AgentRunStatusV1.CANCELLATION_REQUESTED
            run.cancellation_requested_at = event.data.requested_at
            update_fields.append("cancellation_requested_at")
        elif isinstance(event, RunInterruptedEventV1):
            run.status = AgentRunStatusV1.INTERRUPTED
            run.interrupt_id = event.data.interrupt_id
            run.checkpoint_id = event.data.checkpoint_id
            run.interrupt_reason = event.data.reason
            run.interrupt_approval_id = event.data.approval_id
            run.interrupt_tool_call_id = event.data.tool_call_id
            update_fields.extend(self._interrupt_fields())
        elif isinstance(event, RunResumedEventV1):
            await self._resume(run=run, event=event, conn=conn)
            update_fields.extend(self._interrupt_fields())
        elif isinstance(event, RunCompletedEventV1):
            run.status = AgentRunStatusV1.COMPLETED
            run.terminal_at = event.data.completed_at
            update_fields.append("terminal_at")
        elif isinstance(event, RunCancelledEventV1):
            run.status = AgentRunStatusV1.CANCELLED
            run.terminal_at = event.data.cancelled_at
            update_fields.append("terminal_at")
        elif isinstance(event, RunFailedEventV1):
            run.status = AgentRunStatusV1.FAILED
            run.terminal_at = event.data.failed_at
            update_fields.append("terminal_at")
        await run.save(update_fields=update_fields, using_db=conn)

    @staticmethod
    async def _validate_required_interrupt(
        *,
        run: AgentRunV1Record,
        event: RunLifecycleEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if run.last_sequence == 0:
            return
        previous = await AgentRunEventV1Record.filter(run_id=run.id, sequence=run.last_sequence).using_db(conn).first()
        if previous is None or previous.type != "approval.required":
            return
        previous_payload = cast(JsonObject, previous.payload)
        previous_data = cast(JsonObject, previous_payload.get("data"))
        approval = cast(JsonObject, previous_data.get("approval"))
        if (
            not isinstance(event, RunInterruptedEventV1)
            or event.data.reason != "approval_required"
            or event.data.approval_id != approval.get("approvalId")
            or event.data.tool_call_id != approval.get("toolCallId")
            or event.data.checkpoint_id != approval.get("checkpointId")
        ):
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_INTERRUPT_REQUIRED")

    @staticmethod
    async def _require_human_tool_part(
        *,
        run: AgentRunV1Record,
        event: RunInterruptedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        part = await (
            AgentMessagePartV1Record
            .filter(tool_call_id=event.data.tool_call_id, status="running")
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if part is None or part.type != "tool-call":
            raise AgentRuntimePersistenceError("AGENT_TOOL_RESULT_NOT_PENDING")
        message_exists = await AgentMessageV1Record.filter(id=part.message_id, run_id=run.id).using_db(conn).exists()
        if not message_exists or "approval" in cast(JsonObject, part.payload):
            raise AgentRuntimePersistenceError("AGENT_TOOL_RESULT_NOT_PENDING")

    async def _resume(
        self,
        *,
        run: AgentRunV1Record,
        event: RunResumedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if event.data.interrupt_id != run.interrupt_id or event.data.checkpoint_id != run.checkpoint_id:
            raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_CHECKPOINT_MISMATCH")
        if event.data.resume_kind == "approval" and run.interrupt_approval_id is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_KIND_MISMATCH")
        if event.data.resume_kind == "human_result" and run.interrupt_approval_id is not None:
            raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_KIND_MISMATCH")
        if event.data.resume_kind == "approval":
            await self._require_resolved_approval(run=run, conn=conn)
        await self._consume_response(run=run, event=event, conn=conn)
        run.status = AgentRunStatusV1.RUNNING
        run.interrupt_id = None
        run.checkpoint_id = None
        run.interrupt_reason = None
        run.interrupt_approval_id = None
        run.interrupt_tool_call_id = None

    @staticmethod
    async def _require_resolved_approval(*, run: AgentRunV1Record, conn: BaseDBAsyncClient) -> None:
        resolved = (
            await AgentApprovalV1Record
            .filter(
                run_id=run.id,
                approval_id=run.interrupt_approval_id,
                status__in=(AgentApprovalStatusV1.APPROVED, AgentApprovalStatusV1.REJECTED),
            )
            .using_db(conn)
            .exists()
        )
        if not resolved:
            raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_APPROVAL_MISSING")

    @staticmethod
    async def _consume_response(
        *,
        run: AgentRunV1Record,
        event: RunResumedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        response_kind = (
            AgentToolResponseKindV1.APPROVAL
            if event.data.resume_kind == "approval"
            else AgentToolResponseKindV1.HUMAN_RESULT
        )
        responses = await (
            AgentToolResponseV1Record
            .filter(
                run_id=run.id,
                checkpoint_id=run.checkpoint_id,
                tool_call_id=run.interrupt_tool_call_id,
                kind=response_kind,
                consumed_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .all()
        )
        if len(responses) != 1:
            raise AgentRuntimePersistenceError("AGENT_RUN_RESUME_RESPONSE_MISSING")
        responses[0].consumed_at = event.data.resumed_at
        await responses[0].save(update_fields=["consumed_at", "updated_at"], using_db=conn)

    @staticmethod
    def _interrupt_fields() -> list[str]:
        return [
            "interrupt_id",
            "checkpoint_id",
            "interrupt_reason",
            "interrupt_approval_id",
            "interrupt_tool_call_id",
        ]
