from __future__ import annotations

from uuid import uuid4

import pytest

from src.models.agents.runtime_v1 import AgentMessagePartV1Record, AgentThreadV1Record
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.runtime_protocol_schema import (
    MessagePartCompletedEventV1,
    MessagePartDeltaEventV1,
    MessagePartStartedEventV1,
    RunCreatedEventV1,
    RunStartedEventV1,
)
from src.modules.ai.runtime_repository import (
    AgentRuntimePersistenceError,
    AgentRuntimeRepository,
)
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from tests.modules.ai.runtime_agent_test_ids import (
    TEST_LEAD_AGENT_ASSIGNMENT_ID,
    TEST_LEAD_AGENT_ID,
    TEST_LEAD_AGENT_VERSION_ID,
)

pytestmark = pytest.mark.integration


async def _create_thread() -> tuple[Workspace, ProjectRecord, AgentThreadV1Record]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-message-org-{uuid4().hex[:10]}",
        name="Agent Message Projection Org",
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Message Projection Workspace",
        is_active=True,
        owner_user_id=owner_user_id,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-message-project-{uuid4().hex[:10]}",
        name="Agent Message Projection Project",
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
        title="Message projection",
    )
    return workspace, project, thread


@pytest.mark.asyncio
async def test_message_projection_persists_ordered_text_deltas_and_integrity_snapshot(prepared_db) -> None:
    _ = prepared_db
    workspace, project, thread = await _create_thread()
    run_id = uuid4()
    message_id = uuid4()
    part_id = uuid4()
    correlation_id = "correlation-message-projection"
    repository = AgentRuntimeRepository()
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
        message="Draft the homepage introduction.",
        idempotency_key="run-command-message-projection",
        correlation_id=correlation_id,
    )
    envelope = {
        "eventVersion": 1,
        "runId": str(run_id),
        "threadId": str(thread.id),
        "correlationId": correlation_id,
        "spanId": None,
        "parentSpanId": None,
    }
    created = RunCreatedEventV1.model_validate({
        **envelope,
        "eventId": "event-message-1",
        "cursor": "cursor-message-1",
        "type": "run.created",
        "sequence": 1,
        "occurredAt": "2026-07-18T12:00:00.000Z",
        "data": {
            "run": {
                "status": "created",
                "executionMode": "build",
                "leadAgentId": str(TEST_LEAD_AGENT_ID),
                "createdAt": "2026-07-18T12:00:00.000Z",
            }
        },
    })
    started = RunStartedEventV1.model_validate({
        **envelope,
        "eventId": "event-message-2",
        "cursor": "cursor-message-2",
        "type": "run.started",
        "sequence": 2,
        "occurredAt": "2026-07-18T12:00:01.000Z",
        "data": {
            "startedAt": "2026-07-18T12:00:01.000Z",
            "attemptNumber": 1,
            "agentVersionId": "agent-version-lead",
        },
    })
    part_started = MessagePartStartedEventV1.model_validate({
        **envelope,
        "eventId": "event-message-3",
        "cursor": "cursor-message-3",
        "type": "message.part.started",
        "sequence": 3,
        "occurredAt": "2026-07-18T12:00:02.000Z",
        "data": {
            "message": {
                "messageId": str(message_id),
                "role": "assistant",
                "agentId": "agent-lead",
                "createdAt": "2026-07-18T12:00:02.000Z",
                "placement": {"kind": "thread"},
            },
            "part": {
                "partId": str(part_id),
                "partIndex": 0,
                "type": "text",
                "status": "running",
                "text": "",
            },
        },
    })
    first_delta = MessagePartDeltaEventV1.model_validate({
        **envelope,
        "eventId": "event-message-4",
        "cursor": "cursor-message-4",
        "type": "message.part.delta",
        "sequence": 4,
        "occurredAt": "2026-07-18T12:00:03.000Z",
        "data": {
            "messageId": str(message_id),
            "partId": str(part_id),
            "delta": {"kind": "text.append", "text": "Hello"},
        },
    })
    second_delta = MessagePartDeltaEventV1.model_validate({
        **envelope,
        "eventId": "event-message-5",
        "cursor": "cursor-message-5",
        "type": "message.part.delta",
        "sequence": 5,
        "occurredAt": "2026-07-18T12:00:04.000Z",
        "data": {
            "messageId": str(message_id),
            "partId": str(part_id),
            "delta": {"kind": "text.append", "text": " world"},
        },
    })
    invalid_completion = MessagePartCompletedEventV1.model_validate({
        **envelope,
        "eventId": "event-message-6-invalid",
        "cursor": "cursor-message-6-invalid",
        "type": "message.part.completed",
        "sequence": 6,
        "occurredAt": "2026-07-18T12:00:05.000Z",
        "data": {
            "messageId": str(message_id),
            "part": {
                "partId": str(part_id),
                "partIndex": 0,
                "type": "text",
                "status": "complete",
                "text": "integrity mismatch",
            },
        },
    })
    completion = invalid_completion.model_copy(
        update={
            "event_id": "event-message-6",
            "cursor": "cursor-message-6",
            "data": invalid_completion.data.model_copy(
                update={"part": invalid_completion.data.part.model_copy(update={"text": "Hello world"})}
            ),
        }
    )
    await repository.create_run_with_first_event(command=command, event=created)
    await repository.append_event(event=started)
    await repository.append_event(event=part_started)
    await repository.append_event(event=first_delta)
    await repository.append_event(event=second_delta)

    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_MESSAGE_PART_INTEGRITY_MISMATCH"):
        await repository.append_event(event=invalid_completion)

    running_part = await AgentMessagePartV1Record.get(id=part_id)
    assert running_part.status == "running"
    assert running_part.text == "Hello world"
    assert [event.sequence for event in await repository.list_events_after(run_id=run_id, sequence=0)] == [
        1,
        2,
        3,
        4,
        5,
    ]

    await repository.append_event(event=completion)

    messages = await repository.list_messages(thread_id=thread.id)
    assert [(message.role, message.status, message.parts[0].status, message.parts[0].text) for message in messages] == [
        ("user", "complete", "complete", "Draft the homepage introduction."),
        ("assistant", "complete", "complete", "Hello world"),
    ]
    assert [event.sequence for event in await repository.list_events_after(run_id=run_id, sequence=0)] == [
        1,
        2,
        3,
        4,
        5,
        6,
    ]
