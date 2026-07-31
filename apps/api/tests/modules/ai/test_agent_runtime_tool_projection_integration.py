from __future__ import annotations

import json
from collections.abc import Mapping
from uuid import UUID, uuid4

import pytest

from src.models.agents.runtime_v1 import AgentMessagePartV1Record, AgentRunV1Record, AgentThreadV1Record
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.runtime_protocol_schema import (
    MessagePartCompletedEventV1,
    MessagePartStartedEventV1,
    RunCreatedEventV1,
    RunStartedEventV1,
)
from src.modules.ai.runtime_repository import AgentRuntimePersistenceError, AgentRuntimeRepository
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from src.modules.ai.runtime_tool_protocol_schema import (
    ToolCompletedEventV1,
    ToolFailedEventV1,
    ToolProgressEventV1,
    ToolStartedEventV1,
)
from tests.modules.ai.runtime_agent_test_ids import (
    TEST_LEAD_AGENT_ASSIGNMENT_ID,
    TEST_LEAD_AGENT_ID,
    TEST_LEAD_AGENT_VERSION_ID,
)

pytestmark = pytest.mark.integration


async def _create_thread() -> tuple[Workspace, ProjectRecord, AgentThreadV1Record]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-tool-org-{uuid4().hex[:10]}",
        name="Agent Tool Projection Org",
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Tool Projection Workspace",
        is_active=True,
        owner_user_id=owner_user_id,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-tool-project-{uuid4().hex[:10]}",
        name="Agent Tool Projection Project",
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
        title="Tool projection",
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
        "eventId": f"event-tool-{identity}",
        "cursor": f"cursor-tool-{identity}",
        "type": event_type,
        "sequence": sequence,
        "occurredAt": f"2026-07-18T12:00:{sequence:02d}.000Z",
        "data": data,
    }


def _canonical(value: Mapping[str, object]) -> str:
    return json.dumps(dict(value), ensure_ascii=False, separators=(",", ":"), sort_keys=True)


async def _create_running_run() -> tuple[AgentRuntimeRepository, AgentThreadV1Record, UUID, dict[str, object]]:
    workspace, project, thread = await _create_thread()
    run_id = uuid4()
    correlation_id = "correlation-tool-projection"
    repository = AgentRuntimeRepository()
    envelope: dict[str, object] = {
        "eventVersion": 1,
        "runId": str(run_id),
        "threadId": str(thread.id),
        "correlationId": correlation_id,
        "spanId": "span-tool",
        "parentSpanId": "span-run",
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
        message="Query content and publish the result.",
        idempotency_key="run-command-tool-projection",
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
                    "createdAt": "2026-07-18T12:00:01.000Z",
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
                "startedAt": "2026-07-18T12:00:02.000Z",
                "attemptNumber": 1,
                "agentVersionId": "agent-version-lead",
            },
        )
    )
    await repository.create_run_with_first_event(command=command, event=created)
    await repository.append_event(event=started)
    return repository, thread, run_id, envelope


@pytest.mark.asyncio
async def test_tool_projection_enforces_identity_ordering_and_nonterminal_failure(prepared_db) -> None:
    _ = prepared_db
    repository, thread, run_id, envelope = await _create_running_run()
    message_id = uuid4()
    query_part_id = uuid4()
    query_args = {"limit": 2, "query": "pricing"}
    query_part_started = MessagePartStartedEventV1.model_validate(
        _event(
            envelope,
            event_type="message.part.started",
            sequence=3,
            data={
                "message": {
                    "messageId": str(message_id),
                    "role": "assistant",
                    "agentId": "agent-lead",
                    "createdAt": "2026-07-18T12:00:03.000Z",
                    "placement": {"kind": "thread"},
                },
                "part": {
                    "partId": str(query_part_id),
                    "partIndex": 0,
                    "type": "tool-call",
                    "status": "running",
                    "toolCallId": "tool-call-query",
                    "toolName": "content.query",
                    "args": query_args,
                    "argsText": _canonical(query_args),
                },
            },
        )
    )
    invalid_started = ToolStartedEventV1.model_validate(
        _event(
            envelope,
            event_type="tool.started",
            sequence=4,
            suffix="-invalid",
            data={
                "messageId": str(message_id),
                "partId": str(query_part_id),
                "toolCallId": "tool-call-query",
                "toolId": "tool-content-query",
                "toolVersion": "v1",
                "toolName": "content.query",
                "args": {"query": "identity drift"},
                "argsText": _canonical({"query": "identity drift"}),
                "startedAt": "2026-07-18T12:00:04.000Z",
            },
        )
    )
    query_started = invalid_started.model_copy(
        update={
            "event_id": "event-tool-4",
            "cursor": "cursor-tool-4",
            "data": invalid_started.data.model_copy(update={"args": query_args, "args_text": _canonical(query_args)}),
        }
    )
    premature_completion = MessagePartCompletedEventV1.model_validate(
        _event(
            envelope,
            event_type="message.part.completed",
            sequence=5,
            suffix="-premature",
            data={
                "messageId": str(message_id),
                "part": {
                    "partId": str(query_part_id),
                    "partIndex": 0,
                    "type": "tool-call",
                    "status": "complete",
                    "toolCallId": "tool-call-query",
                    "toolName": "content.query",
                    "args": query_args,
                    "argsText": _canonical(query_args),
                    "result": {"matchCount": 2},
                },
            },
        )
    )
    progress = ToolProgressEventV1.model_validate(
        _event(
            envelope,
            event_type="tool.progress",
            sequence=5,
            data={
                "toolCallId": "tool-call-query",
                "progress": {
                    "messageKey": "agents.tools.contentQuery.searching",
                    "messageParams": {"collection": "pages"},
                    "current": 1,
                    "total": 2,
                    "unit": "collections",
                },
            },
        )
    )
    completed = ToolCompletedEventV1.model_validate(
        _event(
            envelope,
            event_type="tool.completed",
            sequence=6,
            data={
                "toolCallId": "tool-call-query",
                "completedAt": "2026-07-18T12:00:06.000Z",
                "result": {"matchCount": 2},
                "artifactRefs": [{"artifactId": "artifact-query-results"}],
            },
        )
    )
    query_part_completed = MessagePartCompletedEventV1.model_validate(
        _event(
            envelope,
            event_type="message.part.completed",
            sequence=7,
            data={
                "messageId": str(message_id),
                "part": {
                    "partId": str(query_part_id),
                    "partIndex": 0,
                    "type": "tool-call",
                    "status": "complete",
                    "toolCallId": "tool-call-query",
                    "toolName": "content.query",
                    "args": query_args,
                    "argsText": _canonical(query_args),
                    "result": {"matchCount": 2},
                    "artifactRefs": [{"artifactId": "artifact-query-results"}],
                },
            },
        )
    )
    await repository.append_event(event=query_part_started)
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TOOL_IDENTITY_MISMATCH"):
        await repository.append_event(event=invalid_started)
    await repository.append_event(event=query_started)
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_TOOL_OUTCOME_MISSING"):
        await repository.append_event(event=premature_completion)
    await repository.append_event(event=progress)
    await repository.append_event(event=completed)
    await repository.append_event(event=query_part_completed)

    publish_part_id = uuid4()
    publish_args = {"target": "production"}
    publish_part_started = MessagePartStartedEventV1.model_validate(
        _event(
            envelope,
            event_type="message.part.started",
            sequence=8,
            data={
                "message": {
                    "messageId": str(message_id),
                    "role": "assistant",
                    "agentId": "agent-lead",
                    "createdAt": "2026-07-18T12:00:03.000Z",
                    "placement": {"kind": "thread"},
                },
                "part": {
                    "partId": str(publish_part_id),
                    "partIndex": 1,
                    "type": "tool-call",
                    "status": "running",
                    "toolCallId": "tool-call-publish",
                    "toolName": "connector.publish",
                    "args": publish_args,
                    "argsText": _canonical(publish_args),
                },
            },
        )
    )
    publish_started = ToolStartedEventV1.model_validate(
        _event(
            envelope,
            event_type="tool.started",
            sequence=9,
            data={
                "messageId": str(message_id),
                "partId": str(publish_part_id),
                "toolCallId": "tool-call-publish",
                "toolId": "tool-connector-publish",
                "toolVersion": "v1",
                "toolName": "connector.publish",
                "args": publish_args,
                "argsText": _canonical(publish_args),
                "startedAt": "2026-07-18T12:00:09.000Z",
            },
        )
    )
    failure_error = {
        "code": "connector_unavailable",
        "message": "The publishing connector is unavailable.",
        "retryable": True,
    }
    publish_failed = ToolFailedEventV1.model_validate(
        _event(
            envelope,
            event_type="tool.failed",
            sequence=10,
            data={
                "toolCallId": "tool-call-publish",
                "failedAt": "2026-07-18T12:00:10.000Z",
                "error": failure_error,
            },
        )
    )
    publish_part_completed = MessagePartCompletedEventV1.model_validate(
        _event(
            envelope,
            event_type="message.part.completed",
            sequence=11,
            data={
                "messageId": str(message_id),
                "part": {
                    "partId": str(publish_part_id),
                    "partIndex": 1,
                    "type": "tool-call",
                    "status": "failed",
                    "toolCallId": "tool-call-publish",
                    "toolName": "connector.publish",
                    "args": publish_args,
                    "argsText": _canonical(publish_args),
                    "error": failure_error,
                },
            },
        )
    )
    await repository.append_event(event=publish_part_started)
    await repository.append_event(event=publish_started)
    await repository.append_event(event=publish_failed)
    await repository.append_event(event=publish_part_completed)

    query_part = await AgentMessagePartV1Record.get(id=query_part_id)
    publish_part = await AgentMessagePartV1Record.get(id=publish_part_id)
    run = await AgentRunV1Record.get(id=run_id)
    assert query_part.status == "complete"
    assert query_part.payload["result"] == {"matchCount": 2}
    assert query_part.payload["artifactRefs"] == [{"artifactId": "artifact-query-results"}]
    assert publish_part.status == "failed"
    assert publish_part.payload["error"] == failure_error
    assert str(run.status) == "running"
    assert run.last_sequence == 11
    assert [event.sequence for event in await repository.list_events_after(run_id=run_id, sequence=0)] == list(
        range(1, 12)
    )
