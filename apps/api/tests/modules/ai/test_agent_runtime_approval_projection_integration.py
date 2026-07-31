from __future__ import annotations

import json
from collections.abc import Mapping
from copy import deepcopy
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.models.agents.runtime_v1 import (
    AgentApprovalV1Record,
    AgentMessagePartV1Record,
    AgentRunEventV1Record,
    AgentRunV1Record,
    AgentThreadV1Record,
    AgentToolResponseV1Record,
)
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalRequiredEventV1,
    ApprovalResolvedEventV1,
    RunInterruptedEventV1,
    RunResumedEventV1,
)
from src.modules.ai.runtime_protocol_schema import MessagePartStartedEventV1, RunCreatedEventV1, RunStartedEventV1
from src.modules.ai.runtime_repository import AgentRuntimePersistenceError, AgentRuntimeRepository
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from src.modules.ai.runtime_tool_response_schema import (
    ApprovalToolResponseCommandV1,
    HumanToolResultResponseCommandV1,
)
from tests.modules.ai.runtime_agent_test_ids import (
    TEST_LEAD_AGENT_ASSIGNMENT_ID,
    TEST_LEAD_AGENT_ID,
    TEST_LEAD_AGENT_VERSION_ID,
)

pytestmark = pytest.mark.integration
RESPONSE_TIME = datetime(2026, 7, 19, 6, 1, tzinfo=UTC)


async def _create_thread() -> tuple[Workspace, ProjectRecord, AgentThreadV1Record]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-approval-org-{uuid4().hex[:10]}",
        name="Agent Approval Projection Org",
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Approval Projection Workspace",
        is_active=True,
        owner_user_id=owner_user_id,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-approval-project-{uuid4().hex[:10]}",
        name="Agent Approval Projection Project",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    thread = await AgentThreadV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        owner_user_id=owner_user_id,
        lead_agent_id=str(TEST_LEAD_AGENT_ID),
        lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
        lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
        title="Approval projection",
    )
    return workspace, project, thread


def _event(
    envelope: dict[str, object],
    *,
    event_type: str,
    sequence: int,
    data: dict[str, object],
    suffix: str = "",
) -> dict[str, object]:
    identity = f"{sequence}{suffix}"
    return {
        **envelope,
        "eventId": f"event-approval-{identity}",
        "cursor": f"cursor-approval-{identity}",
        "type": event_type,
        "sequence": sequence,
        "occurredAt": f"2026-07-19T06:00:{sequence:02d}.000Z",
        "data": data,
    }


def _canonical(value: Mapping[str, object]) -> str:
    return json.dumps(dict(value), ensure_ascii=False, separators=(",", ":"), sort_keys=True)


async def _create_running_run() -> tuple[AgentRuntimeRepository, AgentThreadV1Record, UUID, dict[str, object]]:
    workspace, project, thread = await _create_thread()
    run_id = uuid4()
    correlation_id = "correlation-approval-projection"
    repository = AgentRuntimeRepository()
    envelope: dict[str, object] = {
        "eventVersion": 1,
        "runId": str(run_id),
        "threadId": str(thread.id),
        "correlationId": correlation_id,
        "spanId": "span-approval",
        "parentSpanId": "span-tool",
    }
    command = AgentRunCreatePersistenceCommand(
        run_id=run_id,
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        owner_user_id=thread.owner_user_id,
        lead_agent_id=TEST_LEAD_AGENT_ID,
        lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
        lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
        mentioned_agent_ids=(),
        execution_mode="build",
        site_revision_id=None,
        message="Publish the approved website revision.",
        idempotency_key="run-command-approval-projection",
        correlation_id=correlation_id,
    )
    created = RunCreatedEventV1.model_validate(
        _event(
            {**envelope, "spanId": None, "parentSpanId": None},
            event_type="run.created",
            sequence=1,
            data={
                "run": {
                    "status": "created",
                    "executionMode": "build",
                    "leadAgentId": str(TEST_LEAD_AGENT_ID),
                    "createdAt": "2026-07-19T06:00:01.000Z",
                }
            },
        )
    )
    started = RunStartedEventV1.model_validate(
        _event(
            {**envelope, "spanId": None, "parentSpanId": None},
            event_type="run.started",
            sequence=2,
            data={
                "startedAt": "2026-07-19T06:00:02.000Z",
                "attemptNumber": 1,
                "agentVersionId": "agent-version-lead",
            },
        )
    )
    await repository.create_run_with_first_event(command=command, event=created)
    await repository.append_event(event=started)
    return repository, thread, run_id, envelope


def _approval(*, status: str = "pending") -> dict[str, object]:
    return {
        "approvalId": "approval-publish-1",
        "approvalVersion": 1,
        "toolCallId": "tool-call-publish-1",
        "checkpointId": "checkpoint-publish-1",
        "status": status,
        "requestedAt": "2026-07-19T06:00:04.000Z",
        "expiresAt": "2026-07-19T07:00:04.000Z",
        "policyVersion": "policy-v1",
        "risk": {
            "sideEffectClass": "publish",
            "summaryKey": "agents.approval.publish.summary",
            "summaryParams": {"target": "production"},
            "previewRef": "preview-publish-1",
        },
        "options": [
            {
                "id": "allow_once",
                "kind": "allow-once",
                "labelKey": "agents.approval.allowOnce",
                "descriptionKey": "agents.approval.allowOnceDescription",
                "grants": [],
                "confirm": True,
            }
        ],
    }


@pytest.mark.asyncio
async def test_approval_projection_is_atomic_and_requires_matching_interrupt(prepared_db) -> None:
    _ = prepared_db
    repository, thread, run_id, envelope = await _create_running_run()
    message_id = uuid4()
    part_id = uuid4()
    args = {"revisionId": "revision-1", "target": "production"}
    part_started = MessagePartStartedEventV1.model_validate(
        _event(
            envelope,
            event_type="message.part.started",
            sequence=3,
            data={
                "message": {
                    "messageId": str(message_id),
                    "role": "assistant",
                    "agentId": "agent-lead",
                    "createdAt": "2026-07-19T06:00:03.000Z",
                    "placement": {"kind": "thread"},
                },
                "part": {
                    "partId": str(part_id),
                    "partIndex": 0,
                    "type": "tool-call",
                    "status": "running",
                    "toolCallId": "tool-call-publish-1",
                    "toolName": "site.publish",
                    "args": args,
                    "argsText": _canonical(args),
                },
            },
        )
    )
    required = ApprovalRequiredEventV1.model_validate(
        _event(
            envelope,
            event_type="approval.required",
            sequence=4,
            data={"approval": _approval(), "messageId": str(message_id), "partId": str(part_id)},
        )
    )
    invalid_interrupt = RunInterruptedEventV1.model_validate(
        _event(
            envelope,
            event_type="run.interrupted",
            sequence=5,
            suffix="-invalid",
            data={
                "interruptId": "interrupt-publish-1",
                "checkpointId": "wrong-checkpoint",
                "reason": "approval_required",
                "approvalId": "approval-publish-1",
                "toolCallId": "tool-call-publish-1",
            },
        )
    )
    interrupted = invalid_interrupt.model_copy(
        update={
            "event_id": "event-approval-5",
            "cursor": "cursor-approval-5",
            "data": invalid_interrupt.data.model_copy(update={"checkpoint_id": "checkpoint-publish-1"}),
        }
    )
    await repository.append_event(event=part_started)
    await repository.append_event(event=required)
    assert await repository.append_event(event=required) == await repository.append_event(event=required)
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_APPROVAL_INTERRUPT_REQUIRED"):
        await repository.append_event(event=invalid_interrupt)

    run_before_interrupt = await AgentRunV1Record.get(id=run_id)
    part_before_interrupt = await AgentMessagePartV1Record.get(id=part_id)
    approval_before_interrupt = await AgentApprovalV1Record.get(approval_id="approval-publish-1")
    assert run_before_interrupt.last_sequence == 4
    assert str(run_before_interrupt.status) == "running"
    assert part_before_interrupt.status == "requires_action"
    assert str(approval_before_interrupt.status) == "pending"
    assert not await AgentRunEventV1Record.filter(event_id=invalid_interrupt.event_id).exists()

    await repository.append_event(event=interrupted)
    run = await AgentRunV1Record.get(id=run_id)
    assert str(run.status) == "interrupted"
    assert run.interrupt_id == "interrupt-publish-1"
    assert run.checkpoint_id == "checkpoint-publish-1"
    assert run.interrupt_approval_id == "approval-publish-1"
    assert run.interrupt_tool_call_id == "tool-call-publish-1"

    invalid_projection = deepcopy(_approval(status="approved"))
    cast(JsonObject, invalid_projection["risk"])["summaryParams"] = {"target": "staging"}
    invalid_resolution = ApprovalResolvedEventV1.model_validate(
        _event(
            envelope,
            event_type="approval.resolved",
            sequence=6,
            suffix="-invalid",
            data={
                "approval": invalid_projection,
                "resolvedAt": "2026-07-19T06:01:00.000Z",
                "resolvedByActorId": str(thread.owner_user_id),
            },
        )
    )
    resolved = ApprovalResolvedEventV1.model_validate(
        _event(
            envelope,
            event_type="approval.resolved",
            sequence=6,
            data={
                "approval": _approval(status="approved"),
                "resolvedAt": "2026-07-19T06:01:00.000Z",
                "resolvedByActorId": str(thread.owner_user_id),
            },
        )
    )
    command = ApprovalToolResponseCommandV1(
        response_id="response-approval-publish-1",
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        thread_id=thread.id,
        run_id=run_id,
        actor_user_id=thread.owner_user_id,
        kind="approval",
        tool_call_id="tool-call-publish-1",
        checkpoint_id="checkpoint-publish-1",
        approval_id="approval-publish-1",
        approval_version=1,
        approved=True,
        option_id="allow_once",
        reason="Publish the reviewed revision.",
        idempotency_key="respond-approval-publish-1",
        responded_at=RESPONSE_TIME,
    )
    stale_command = command.model_copy(
        update={
            "response_id": "response-approval-publish-stale",
            "idempotency_key": "respond-approval-publish-stale",
            "approval_version": 2,
        }
    )
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_APPROVAL_VERSION_CONFLICT"):
        await repository.append_approval_response(command=stale_command, event=resolved)
    expired_command = command.model_copy(
        update={
            "response_id": "response-approval-publish-expired",
            "idempotency_key": "respond-approval-publish-expired",
            "responded_at": datetime(2026, 7, 19, 7, 0, 4, tzinfo=UTC),
        }
    )
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_APPROVAL_EXPIRED"):
        await repository.append_approval_response(command=expired_command, event=resolved)
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_APPROVAL_CONTRACT_MISMATCH"):
        await repository.append_approval_response(command=command, event=invalid_resolution)
    assert str((await AgentApprovalV1Record.get(approval_id="approval-publish-1")).status) == "pending"
    assert (await AgentRunV1Record.get(id=run_id)).last_sequence == 5
    assert not await AgentToolResponseV1Record.filter(response_id=command.response_id).exists()

    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_APPROVAL_RESPONSE_REQUIRED"):
        await repository.append_event(event=resolved)

    persisted, response_id = await repository.append_approval_response(command=command, event=resolved)
    replayed, replayed_response_id = await repository.append_approval_response(command=command, event=resolved)
    assert persisted == replayed
    assert response_id == replayed_response_id == command.response_id
    conflicting = command.model_copy(update={"approved": False, "option_id": None})
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TOOL_RESPONSE_IDEMPOTENCY_CONFLICT"):
        await repository.append_approval_response(command=conflicting, event=resolved)
    resumed = RunResumedEventV1.model_validate(
        _event(
            envelope,
            event_type="run.resumed",
            sequence=7,
            data={
                "interruptId": "interrupt-publish-1",
                "checkpointId": "checkpoint-publish-1",
                "resumedAt": "2026-07-19T06:01:01.000Z",
                "resumeKind": "approval",
            },
        )
    )
    await repository.append_event(event=resumed)

    approval = await AgentApprovalV1Record.get(approval_id="approval-publish-1")
    response = await AgentToolResponseV1Record.get(response_id=command.response_id)
    part = await AgentMessagePartV1Record.get(id=part_id)
    run = await AgentRunV1Record.get(id=run_id)
    assert str(approval.status) == "approved"
    assert approval.resolved_by_actor_id == thread.owner_user_id
    assert approval.selected_option_id == "allow_once"
    assert approval.resolution_reason == "Publish the reviewed revision."
    assert response.consumed_at == resumed.data.resumed_at
    assert part.status == "running"
    assert part.payload["approval"]["status"] == "approved"
    assert str(run.status) == "running"
    assert run.last_sequence == 7
    assert run.interrupt_id is None
    assert run.checkpoint_id is None
    assert [event.sequence for event in await repository.list_events_after(run_id=run_id, sequence=0)] == list(
        range(1, 8)
    )


@pytest.mark.asyncio
async def test_human_tool_result_uses_distinct_response_and_is_consumed_on_resume(prepared_db) -> None:
    _ = prepared_db
    repository, thread, run_id, envelope = await _create_running_run()
    message_id = uuid4()
    part_id = uuid4()
    args = {"questionKey": "agents.questions.chooseAudience"}
    part_started = MessagePartStartedEventV1.model_validate(
        _event(
            envelope,
            event_type="message.part.started",
            sequence=3,
            data={
                "message": {
                    "messageId": str(message_id),
                    "role": "assistant",
                    "agentId": "agent-lead",
                    "createdAt": "2026-07-19T06:00:03.000Z",
                    "placement": {"kind": "thread"},
                },
                "part": {
                    "partId": str(part_id),
                    "partIndex": 0,
                    "type": "tool-call",
                    "status": "running",
                    "toolCallId": "tool-call-human-1",
                    "toolName": "human.choose",
                    "args": args,
                    "argsText": _canonical(args),
                },
            },
        )
    )
    interrupted = RunInterruptedEventV1.model_validate(
        _event(
            envelope,
            event_type="run.interrupted",
            sequence=4,
            data={
                "interruptId": "interrupt-human-1",
                "checkpointId": "checkpoint-human-1",
                "reason": "human_tool_input",
                "toolCallId": "tool-call-human-1",
            },
        )
    )
    command = HumanToolResultResponseCommandV1(
        response_id="response-human-1",
        workspace_id=thread.workspace_id,
        project_id=thread.project_id,
        thread_id=thread.id,
        run_id=run_id,
        actor_user_id=thread.owner_user_id,
        kind="human_result",
        tool_call_id="tool-call-human-1",
        checkpoint_id="checkpoint-human-1",
        result={"audience": "design teams"},
        idempotency_key="respond-human-1",
        responded_at=RESPONSE_TIME,
    )
    await repository.append_event(event=part_started)
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TOOL_RESULT_NOT_PENDING"):
        await repository.record_human_tool_result(command=command)
    invalid_interrupt = interrupted.model_copy(
        update={
            "event_id": "event-approval-4-invalid",
            "cursor": "cursor-approval-4-invalid",
            "data": interrupted.data.model_copy(update={"tool_call_id": "tool-call-missing"}),
        }
    )
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TOOL_RESULT_NOT_PENDING"):
        await repository.append_event(event=invalid_interrupt)
    assert (await AgentRunV1Record.get(id=run_id)).last_sequence == 3
    await repository.append_event(event=interrupted)

    response = await repository.record_human_tool_result(command=command)
    replayed = await repository.record_human_tool_result(command=command)
    assert response == replayed
    conflicting = command.model_copy(update={"result": {"audience": "developers"}})
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TOOL_RESPONSE_IDEMPOTENCY_CONFLICT"):
        await repository.record_human_tool_result(command=conflicting)

    invalid_resume = RunResumedEventV1.model_validate(
        _event(
            envelope,
            event_type="run.resumed",
            sequence=5,
            suffix="-invalid",
            data={
                "interruptId": "interrupt-human-1",
                "checkpointId": "wrong-checkpoint",
                "resumedAt": "2026-07-19T06:01:01.000Z",
                "resumeKind": "human_result",
            },
        )
    )
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_RUN_RESUME_CHECKPOINT_MISMATCH"):
        await repository.append_event(event=invalid_resume)
    stored_response = await AgentToolResponseV1Record.get(response_id=command.response_id)
    assert stored_response.consumed_at is None
    assert (await AgentRunV1Record.get(id=run_id)).last_sequence == 4

    resumed = invalid_resume.model_copy(
        update={
            "event_id": "event-approval-5",
            "cursor": "cursor-approval-5",
            "data": invalid_resume.data.model_copy(update={"checkpoint_id": "checkpoint-human-1"}),
        }
    )
    await repository.append_event(event=resumed)
    stored_response = await AgentToolResponseV1Record.get(response_id=command.response_id)
    run = await AgentRunV1Record.get(id=run_id)
    assert stored_response.consumed_at == resumed.data.resumed_at
    assert str(run.status) == "running"
    assert run.last_sequence == 5
