from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.models.agents.runtime_v1 import AgentRunV1Record, AgentThreadV1Record
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.runtime_protocol_schema import (
    RunCancelRequestedEventV1,
    RunCreatedEventV1,
    RunQueuedEventV1,
    RunStartedEventV1,
)
from src.modules.ai.runtime_repository import (
    AgentRuntimePersistenceError,
    AgentRuntimeRepository,
)
from src.modules.ai.runtime_repository_schema import (
    AgentRunCreatePersistenceCommand,
    PersistedAgentRunEvent,
)
from tests.modules.ai.runtime_agent_test_ids import (
    TEST_LEAD_AGENT_ASSIGNMENT_ID,
    TEST_LEAD_AGENT_ID,
    TEST_LEAD_AGENT_VERSION_ID,
    TEST_MENTIONED_AGENT_ASSIGNMENT_ID,
    TEST_MENTIONED_AGENT_ID,
    TEST_MENTIONED_AGENT_VERSION_ID,
)

pytestmark = pytest.mark.integration


async def _create_thread() -> tuple[Workspace, ProjectRecord, AgentThreadV1Record]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-runtime-org-{uuid4().hex[:10]}",
        name="Agent Runtime Repository Org",
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Runtime Repository Workspace",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-runtime-project-{uuid4().hex[:10]}",
        name="Agent Runtime Repository Project",
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
        title="Homepage collaboration",
    )
    return workspace, project, thread


@pytest.mark.asyncio
async def test_agent_runtime_repository_idempotently_commits_run_and_first_event(prepared_db) -> None:
    _ = prepared_db
    workspace, project, thread = await _create_thread()
    run_id = uuid4()
    occurred_at = datetime(2026, 7, 18, 12, 0, tzinfo=UTC)
    event = RunCreatedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "event-create-1",
        "cursor": "cursor-create-1",
        "type": "run.created",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 1,
        "occurredAt": occurred_at.isoformat().replace("+00:00", "Z"),
        "correlationId": "correlation-create-1",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "run": {
                "status": "created",
                "executionMode": "build",
                "leadAgentId": str(TEST_LEAD_AGENT_ID),
                "createdAt": occurred_at.isoformat().replace("+00:00", "Z"),
            }
        },
    })
    command = AgentRunCreatePersistenceCommand(
        run_id=run_id,
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        owner_user_id=thread.owner_user_id,
        lead_agent_id=TEST_LEAD_AGENT_ID,
        lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
        lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
        mentioned_agent_ids=(TEST_MENTIONED_AGENT_ID,),
        mentioned_agent_version_ids=(TEST_MENTIONED_AGENT_VERSION_ID,),
        mentioned_agent_assignment_ids=(TEST_MENTIONED_AGENT_ASSIGNMENT_ID,),
        execution_mode="build",
        site_revision_id=None,
        message="Rewrite the homepage.",
        idempotency_key="run-command-1",
        correlation_id="correlation-create-1",
    )
    repository = AgentRuntimeRepository()

    first = await repository.create_run_with_first_event(command=command, event=event)
    repeated = await repository.create_run_with_first_event(command=command, event=event)
    events = await repository.list_events_after(run_id=run_id, sequence=0)
    messages = await repository.list_messages(thread_id=thread.id)

    assert repeated == first
    assert first.run_id == run_id
    assert first.last_sequence == 1
    assert first.last_cursor == "cursor-create-1"
    assert [item.event_id for item in events] == ["event-create-1"]
    assert events[0].payload == event.model_dump(by_alias=True, mode="json")
    assert [(item.role, item.status, item.parts[0].type, item.parts[0].text) for item in messages] == [
        ("user", "complete", "text", "Rewrite the homepage.")
    ]


@pytest.mark.asyncio
async def test_agent_runtime_repository_appends_contiguous_events_and_deduplicates_replay(prepared_db) -> None:
    _ = prepared_db
    workspace, project, thread = await _create_thread()
    run_id = uuid4()
    occurred_at = datetime(2026, 7, 18, 12, 0, tzinfo=UTC)
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
        execution_mode="plan",
        site_revision_id=None,
        message="Plan the homepage.",
        idempotency_key="run-command-sequence",
        correlation_id="correlation-sequence",
    )
    created = RunCreatedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "event-sequence-1",
        "cursor": "cursor-sequence-1",
        "type": "run.created",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 1,
        "occurredAt": "2026-07-18T12:00:00.000Z",
        "correlationId": "correlation-sequence",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "run": {
                "status": "created",
                "executionMode": "plan",
                "leadAgentId": str(TEST_LEAD_AGENT_ID),
                "createdAt": "2026-07-18T12:00:00.000Z",
            }
        },
    })
    queued = RunQueuedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "event-sequence-2",
        "cursor": "cursor-sequence-2",
        "type": "run.queued",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 2,
        "occurredAt": "2026-07-18T12:00:01.000Z",
        "correlationId": "correlation-sequence",
        "spanId": None,
        "parentSpanId": None,
        "data": {"queuedAt": "2026-07-18T12:00:01.000Z", "queueClass": "interactive"},
    })
    repository = AgentRuntimeRepository()
    await repository.create_run_with_first_event(command=command, event=created)

    appended = await repository.append_event(event=queued)
    replayed = await repository.append_event(event=queued)

    assert replayed == appended
    assert appended.sequence == 2
    assert [item.sequence for item in await repository.list_events_after(run_id=run_id, sequence=0)] == [1, 2]

    gap = queued.model_copy(update={"event_id": "event-sequence-4", "cursor": "cursor-sequence-4", "sequence": 4})
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_EVENT_SEQUENCE_INVALID"):
        await repository.append_event(event=gap)


@pytest.mark.asyncio
async def test_agent_runtime_repository_serializes_concurrent_next_sequence_appends(prepared_db) -> None:
    _ = prepared_db
    workspace, project, thread = await _create_thread()
    run_id = uuid4()
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
        message="Build the homepage.",
        idempotency_key="run-command-concurrent-sequence",
        correlation_id="correlation-concurrent-sequence",
    )
    created = RunCreatedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "event-concurrent-1",
        "cursor": "cursor-concurrent-1",
        "type": "run.created",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 1,
        "occurredAt": "2026-07-18T12:00:00.000Z",
        "correlationId": "correlation-concurrent-sequence",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "run": {
                "status": "created",
                "executionMode": "build",
                "leadAgentId": str(TEST_LEAD_AGENT_ID),
                "createdAt": "2026-07-18T12:00:00.000Z",
            }
        },
    })
    queued = RunQueuedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "event-concurrent-2-a",
        "cursor": "cursor-concurrent-2-a",
        "type": "run.queued",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 2,
        "occurredAt": "2026-07-18T12:00:01.000Z",
        "correlationId": "correlation-concurrent-sequence",
        "spanId": None,
        "parentSpanId": None,
        "data": {"queuedAt": "2026-07-18T12:00:01.000Z", "queueClass": "interactive"},
    })
    contender = queued.model_copy(update={"event_id": "event-concurrent-2-b", "cursor": "cursor-concurrent-2-b"})
    first_repository = AgentRuntimeRepository()
    second_repository = AgentRuntimeRepository()
    await first_repository.create_run_with_first_event(command=command, event=created)

    results = await asyncio.gather(
        first_repository.append_event(event=queued),
        second_repository.append_event(event=contender),
        return_exceptions=True,
    )

    committed = [result for result in results if isinstance(result, PersistedAgentRunEvent)]
    conflicts = [result for result in results if isinstance(result, AgentRuntimePersistenceError)]
    assert len(committed) == 1
    assert len(conflicts) == 1
    assert conflicts[0].code == "AGENT_EVENT_SEQUENCE_INVALID"

    history = await first_repository.list_events_after(run_id=run_id, sequence=0)
    run = await AgentRunV1Record.get(id=run_id)
    assert [event.sequence for event in history] == [1, 2]
    assert history[-1].cursor == committed[0].cursor
    assert run.last_sequence == 2
    assert run.last_cursor == committed[0].cursor


@pytest.mark.asyncio
async def test_agent_runtime_repository_projects_started_and_cancel_requested_run_head(prepared_db) -> None:
    _ = prepared_db
    workspace, project, thread = await _create_thread()
    run_id = uuid4()
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
        message="Build the homepage.",
        idempotency_key="run-command-lifecycle-projection",
        correlation_id="correlation-lifecycle-projection",
    )
    created = RunCreatedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "event-lifecycle-1",
        "cursor": "cursor-lifecycle-1",
        "type": "run.created",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 1,
        "occurredAt": "2026-07-18T12:00:00.000Z",
        "correlationId": "correlation-lifecycle-projection",
        "spanId": None,
        "parentSpanId": None,
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
        "eventVersion": 1,
        "eventId": "event-lifecycle-2",
        "cursor": "cursor-lifecycle-2",
        "type": "run.started",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 2,
        "occurredAt": "2026-07-18T12:00:01.000Z",
        "correlationId": "correlation-lifecycle-projection",
        "spanId": "span-attempt-1",
        "parentSpanId": None,
        "data": {
            "startedAt": "2026-07-18T12:00:01.000Z",
            "attemptNumber": 1,
            "agentVersionId": "agent-version-lead",
        },
    })
    cancellation = RunCancelRequestedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "event-lifecycle-3",
        "cursor": "cursor-lifecycle-3",
        "type": "run.cancel.requested",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 3,
        "occurredAt": "2026-07-18T12:00:02.000Z",
        "correlationId": "correlation-lifecycle-projection",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "requestedAt": "2026-07-18T12:00:02.000Z",
            "requestedByActorId": str(thread.owner_user_id),
        },
    })
    repository = AgentRuntimeRepository()
    await repository.create_run_with_first_event(command=command, event=created)

    await repository.append_event(event=started)
    await repository.append_event(event=cancellation)

    run = await AgentRunV1Record.get(id=run_id)
    history = await repository.list_events_after(run_id=run_id, sequence=0)
    assert str(run.status) == "cancellation_requested"
    assert run.cancellation_requested_at == cancellation.data.requested_at
    assert run.last_sequence == 3
    assert run.last_cursor == "cursor-lifecycle-3"
    assert [event.event_id for event in history] == [
        "event-lifecycle-1",
        "event-lifecycle-2",
        "event-lifecycle-3",
    ]
