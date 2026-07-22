from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.models.agents.runtime_v1 import (
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
)
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.ai.runtime_output_protocol_schema import SettlementV1, UsageV1
from src.modules.ai.runtime_protocol_schema import ArtifactRefV1, PublicErrorV1
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_snapshot_schema import (
    AgentChangeSetSnapshotV1,
    AgentDelegationSnapshotV1,
    AgentMessagePartSnapshotV1,
    AgentMessageSnapshotV1,
    AgentPendingApprovalSnapshotV1,
    AgentRunInterruptSnapshotV1,
    AgentRunSnapshotV1,
    AgentRunStateSnapshotV1,
    AgentThreadSnapshotV1,
)

MessageRole = Literal["assistant", "user"]
MessageStatus = Literal["running", "complete", "incomplete", "failed"]
InterruptReason = Literal["approval_required", "human_tool_input"]
ExecutionMode = Literal["plan", "build"]
RunStatus = Literal[
    "created",
    "queued",
    "running",
    "cancellation_requested",
    "interrupted",
    "completed",
    "cancelled",
    "failed",
]
TERMINAL_RUN_STATUSES = {
    AgentRunStatusV1.COMPLETED,
    AgentRunStatusV1.CANCELLED,
    AgentRunStatusV1.FAILED,
}


def project_message_part(record: AgentMessagePartV1Record) -> AgentMessagePartSnapshotV1:
    payload = {
        **cast(JsonObject, record.payload),
        "partId": record.id,
        "partIndex": record.part_index,
        "type": record.type,
        "status": record.status,
    }
    if record.type == "text":
        payload["text"] = record.text
    if record.tool_call_id is not None:
        payload["toolCallId"] = record.tool_call_id
    return AgentMessagePartSnapshotV1.model_validate(payload)


def project_message(
    record: AgentMessageV1Record,
    *,
    parts: tuple[AgentMessagePartSnapshotV1, ...],
) -> AgentMessageSnapshotV1:
    return AgentMessageSnapshotV1(
        message_id=record.id,
        role=cast(MessageRole, record.role),
        status=cast(MessageStatus, record.status),
        agent_id=record.agent_id,
        actor_user_id=record.actor_user_id,
        created_at=record.created_at,
        placement=project_placement(record),
        parts=parts,
    )


def project_placement(message: AgentMessageV1Record) -> JsonObject:
    if message.placement_kind == "thread":
        return {"kind": "thread"}
    if (
        message.placement_kind != "delegation"
        or message.delegation_id is None
        or message.parent_tool_call_id is None
        or message.source_run_id is None
    ):
        raise AgentRuntimePersistenceError("AGENT_MESSAGE_PLACEMENT_INVALID")
    try:
        source_run_id = encode_uuid(UUID(message.source_run_id))
    except ValueError as error:
        raise AgentRuntimePersistenceError("AGENT_MESSAGE_PLACEMENT_INVALID") from error
    return {
        "kind": "delegation",
        "delegationId": message.delegation_id,
        "parentToolCallId": message.parent_tool_call_id,
        "sourceRunId": source_run_id,
    }


def project_artifact_refs(
    *,
    messages: tuple[AgentMessageSnapshotV1, ...],
    delegations: tuple[AgentDelegationSnapshotV1, ...],
) -> tuple[ArtifactRefV1, ...]:
    refs = [ref for message in messages for part in message.parts for ref in part.artifact_refs]
    refs.extend(ref for delegation in delegations for ref in delegation.artifact_refs)
    return tuple({ref.artifact_id: ref for ref in refs}.values())


def project_snapshot(
    *,
    run: AgentRunV1Record,
    thread: AgentThreadV1Record,
    messages: tuple[AgentMessageSnapshotV1, ...],
    approvals: tuple[AgentPendingApprovalSnapshotV1, ...],
    delegations: tuple[AgentDelegationSnapshotV1, ...],
    change_sets: tuple[AgentChangeSetSnapshotV1, ...],
    artifact_refs: tuple[ArtifactRefV1, ...],
    design_system_context: AgentRunDesignSystemContextV1 | None,
) -> AgentRunSnapshotV1:
    if run.last_cursor is None:
        raise AgentRuntimePersistenceError("AGENT_RUN_HEAD_INCOMPLETE")
    return AgentRunSnapshotV1(
        snapshot_version=1,
        run_id=run.id,
        thread_id=run.thread_id,
        thread=_thread(run=run, thread=thread),
        run=_run(run),
        design_system_context=design_system_context,
        messages=messages,
        pending_approvals=approvals,
        delegations=delegations,
        change_sets=change_sets,
        artifact_refs=artifact_refs,
        usage=(UsageV1.model_validate(run.usage) if run.usage is not None else None),
        error=(PublicErrorV1.model_validate(run.error) if run.error is not None else None),
        terminal=run.status in TERMINAL_RUN_STATUSES,
        last_sequence=run.last_sequence,
        last_cursor=run.last_cursor,
        minimum_replay_sequence=run.minimum_replay_sequence,
        minimum_replay_cursor=run.minimum_replay_cursor,
    )


def _thread(*, run: AgentRunV1Record, thread: AgentThreadV1Record) -> AgentThreadSnapshotV1:
    if thread.id != run.thread_id:
        raise AgentRuntimePersistenceError("AGENT_THREAD_NOT_FOUND")
    if thread.lead_agent_version_id is None or thread.lead_agent_assignment_id is None:
        raise AgentRuntimePersistenceError("AGENT_THREAD_AGENT_SNAPSHOT_MISSING")
    return AgentThreadSnapshotV1(
        thread_id=thread.id,
        workspace_id=thread.workspace_id,
        project_id=thread.project_id,
        owner_user_id=thread.owner_user_id,
        lead_agent_id=UUID(thread.lead_agent_id),
        lead_agent_version_id=thread.lead_agent_version_id,
        lead_agent_assignment_id=thread.lead_agent_assignment_id,
        title=thread.title,
        archived_at=thread.archived_at,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


def _run(run: AgentRunV1Record) -> AgentRunStateSnapshotV1:
    if run.lead_agent_version_id is None or run.lead_agent_assignment_id is None:
        raise AgentRuntimePersistenceError("AGENT_RUN_AGENT_SNAPSHOT_MISSING")
    interrupt = None
    interrupt_values = (run.interrupt_id, run.checkpoint_id, run.interrupt_reason, run.interrupt_tool_call_id)
    if any(value is not None for value in interrupt_values):
        if any(value is None for value in interrupt_values):
            raise AgentRuntimePersistenceError("AGENT_RUN_INTERRUPT_INCOMPLETE")
        interrupt = AgentRunInterruptSnapshotV1(
            interrupt_id=cast(str, run.interrupt_id),
            checkpoint_id=cast(str, run.checkpoint_id),
            reason=cast(InterruptReason, run.interrupt_reason),
            approval_id=run.interrupt_approval_id,
            tool_call_id=cast(str, run.interrupt_tool_call_id),
        )
    return AgentRunStateSnapshotV1(
        run_id=run.id,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        thread_id=run.thread_id,
        owner_user_id=run.owner_user_id,
        execution_mode=cast(ExecutionMode, str(run.execution_mode)),
        lead_agent_id=UUID(run.lead_agent_id),
        lead_agent_version_id=run.lead_agent_version_id,
        lead_agent_assignment_id=run.lead_agent_assignment_id,
        mentioned_agent_ids=tuple(UUID(value) for value in run.mentioned_agent_ids),
        mentioned_agent_version_ids=tuple(UUID(value) for value in run.mentioned_agent_version_ids),
        mentioned_agent_assignment_ids=tuple(UUID(value) for value in run.mentioned_agent_assignment_ids),
        site_revision_id=run.site_revision_id,
        status=cast(RunStatus, str(run.status)),
        correlation_id=run.correlation_id,
        cancellation_requested_at=run.cancellation_requested_at,
        interrupt=interrupt,
        terminal_at=run.terminal_at,
        settlement=(SettlementV1.model_validate(run.settlement) if run.settlement is not None else None),
        created_at=run.created_at,
        updated_at=run.updated_at,
    )
