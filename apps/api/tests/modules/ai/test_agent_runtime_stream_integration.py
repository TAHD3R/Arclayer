from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.core.exceptions import APIError, BadRequest, NotFound
from src.models.agents.runtime_v1 import AgentRunV1Record, AgentThreadV1Record
from src.models.organization.organization import Organization, OrganizationKind
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.runtime_output_protocol_schema import RunFailedEventV1
from src.modules.ai.runtime_protocol_schema import RunCreatedEventV1, RunQueuedEventV1
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from src.modules.ai.runtime_stream_repository import project_public_agent_event
from src.modules.ai.runtime_stream_service import AgentRunStreamService
from tests.modules.ai.runtime_agent_test_ids import (
    TEST_LEAD_AGENT_ASSIGNMENT_ID,
    TEST_LEAD_AGENT_ID,
    TEST_LEAD_AGENT_VERSION_ID,
)

pytestmark = pytest.mark.integration


def _json_object(value: object) -> JsonObject:
    assert isinstance(value, dict)
    return cast(JsonObject, value)


async def _run() -> tuple[AgentRuntimeRepository, AgentThreadV1Record, UUID, RunCreatedEventV1]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-stream-org-{uuid4().hex[:10]}",
        name="Agent Stream Org",
        kind=OrganizationKind.TEAM,
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Stream Workspace",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-stream-project-{uuid4().hex[:10]}",
        name="Agent Stream Project",
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
        title="Stream recovery",
    )
    run_id = uuid4()
    created = RunCreatedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "stream-event-created",
        "cursor": "stream-cursor-created",
        "type": "run.created",
        "runId": str(run_id),
        "threadId": str(thread.id),
        "sequence": 1,
        "occurredAt": "2026-07-19T12:00:00Z",
        "correlationId": "stream-correlation",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "run": {
                "status": "created",
                "executionMode": "plan",
                "leadAgentId": str(TEST_LEAD_AGENT_ID),
                "createdAt": "2026-07-19T12:00:00Z",
            }
        },
    })
    repository = AgentRuntimeRepository()
    await repository.create_run_with_first_event(
        command=AgentRunCreatePersistenceCommand(
            run_id=run_id,
            workspace_id=workspace.id,
            project_id=project.id,
            thread_id=thread.id,
            owner_user_id=owner_user_id,
            lead_agent_id=TEST_LEAD_AGENT_ID,
            lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
            lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
            execution_mode="plan",
            site_revision_id=None,
            message="Plan the homepage.",
            idempotency_key="stream-command",
            correlation_id="stream-correlation",
        ),
        event=created,
    )
    return repository, thread, run_id, created


def _queued(*, run_id: UUID, thread_id: UUID) -> RunQueuedEventV1:
    return RunQueuedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "stream-event-queued",
        "cursor": "stream-cursor-queued",
        "type": "run.queued",
        "runId": str(run_id),
        "threadId": str(thread_id),
        "sequence": 2,
        "occurredAt": "2026-07-19T12:00:01Z",
        "correlationId": "stream-correlation",
        "spanId": None,
        "parentSpanId": None,
        "data": {"queuedAt": "2026-07-19T12:00:01Z", "queueClass": "agent-io"},
    })


def _failed(*, run_id: UUID, thread_id: UUID) -> RunFailedEventV1:
    return RunFailedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "stream-event-failed",
        "cursor": "stream-cursor-failed",
        "type": "run.failed",
        "runId": str(run_id),
        "threadId": str(thread_id),
        "sequence": 3,
        "occurredAt": "2026-07-19T12:00:02Z",
        "correlationId": "stream-correlation",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "failedAt": "2026-07-19T12:00:02Z",
            "error": {"code": "provider_unavailable", "message": "Provider unavailable", "retryable": True},
            "incompletePartIds": [],
            "settlement": {
                "outcome": "reconciled",
                "usage": None,
                "creditsCommitted": "0",
                "creditsReleased": "0",
            },
        },
    })


@pytest.mark.asyncio
async def test_snapshot_and_terminal_sse_replay_are_owner_scoped(prepared_db) -> None:
    _ = prepared_db
    repository, thread, run_id, _ = await _run()
    await repository.append_event(event=_queued(run_id=run_id, thread_id=thread.id))
    await repository.append_event(event=_failed(run_id=run_id, thread_id=thread.id))
    service = AgentRunStreamService()

    snapshot = await service.get_snapshot(
        workspace_id=thread.workspace_id,
        owner_user_id=thread.owner_user_id,
        run_id=run_id,
    )
    assert snapshot.terminal is True
    assert snapshot.run.status == "failed"
    assert snapshot.last_sequence == 3

    session = await service.prepare_stream(
        workspace_id=thread.workspace_id,
        owner_user_id=thread.owner_user_id,
        run_id=run_id,
        query_cursor=None,
        last_event_id=None,
    )

    async def _connected() -> bool:
        return False

    frames = [chunk async for chunk in service.iter_sse(session=session, is_disconnected=_connected)]
    text = b"".join(frames).decode()
    assert text.count("event: agent.run.event") == 3
    assert "id: stream-cursor-created" in text
    assert '"type":"run.failed"' in text
    assert f'"runId":"{encode_uuid(run_id)}"' in text
    assert f'"threadId":"{encode_uuid(thread.id)}"' in text
    assert str(run_id) not in text
    assert str(thread.id) not in text

    with pytest.raises(NotFound) as hidden:
        await service.get_snapshot(
            workspace_id=thread.workspace_id,
            owner_user_id=uuid4(),
            run_id=run_id,
        )
    assert hidden.value.error == "AGENT_RUN_NOT_FOUND"


def test_sse_public_projection_encodes_nested_database_ids_without_rewriting_protocol_ids() -> None:
    run_id = uuid4()
    thread_id = uuid4()
    actor_id = uuid4()
    message_id = uuid4()
    part_id = uuid4()
    source_run_id = uuid4()
    payload: JsonObject = {
        "eventVersion": 1,
        "eventId": "stream-message-started",
        "cursor": "stream-message-cursor",
        "type": "message.part.started",
        "runId": str(run_id),
        "threadId": str(thread_id),
        "sequence": 3,
        "occurredAt": "2026-07-19T12:00:02Z",
        "correlationId": "stream-correlation",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "message": {
                "messageId": str(message_id),
                "role": "user",
                "actorUserId": str(actor_id),
                "createdAt": "2026-07-19T12:00:02Z",
                "placement": {
                    "kind": "delegation",
                    "delegationId": "delegation-1",
                    "parentToolCallId": "tool-call-1",
                    "sourceRunId": str(source_run_id),
                },
            },
            "part": {
                "partId": str(part_id),
                "partIndex": 0,
                "type": "text",
                "status": "running",
                "text": "",
            },
        },
    }

    projected = project_public_agent_event(payload)
    projected_data = _json_object(projected["data"])
    projected_message = _json_object(projected_data["message"])
    projected_placement = _json_object(projected_message["placement"])
    projected_part = _json_object(projected_data["part"])

    assert projected["runId"] == encode_uuid(run_id)
    assert projected["threadId"] == encode_uuid(thread_id)
    assert projected_message["messageId"] == encode_uuid(message_id)
    assert projected_message["actorUserId"] == encode_uuid(actor_id)
    assert projected_placement["sourceRunId"] == encode_uuid(source_run_id)
    assert projected_placement["parentToolCallId"] == "tool-call-1"
    assert projected_part["partId"] == encode_uuid(part_id)
    assert payload["runId"] == str(run_id)


def test_sse_public_projection_covers_scalar_and_array_database_references() -> None:
    run_id = uuid4()
    thread_id = uuid4()
    actor_id = uuid4()
    message_id = uuid4()
    part_ids = (uuid4(), uuid4())

    def _event(event_type: str, data: JsonObject) -> JsonObject:
        return {
            "eventVersion": 1,
            "eventId": f"stream-{event_type}",
            "cursor": f"stream-{event_type}-cursor",
            "type": event_type,
            "runId": str(run_id),
            "threadId": str(thread_id),
            "sequence": 4,
            "occurredAt": "2026-07-19T12:00:03Z",
            "correlationId": "stream-correlation",
            "spanId": None,
            "parentSpanId": None,
            "data": data,
        }

    cancel_requested = project_public_agent_event(_event("run.cancel.requested", {"requestedByActorId": str(actor_id)}))
    completed = project_public_agent_event(_event("run.completed", {"assistantMessageId": str(message_id)}))
    failed = project_public_agent_event(
        _event("run.failed", {"incompletePartIds": [str(part_id) for part_id in part_ids]})
    )
    cancel_requested_data = _json_object(cancel_requested["data"])
    completed_data = _json_object(completed["data"])
    failed_data = _json_object(failed["data"])

    assert cancel_requested_data["requestedByActorId"] == encode_uuid(actor_id)
    assert completed_data["assistantMessageId"] == encode_uuid(message_id)
    assert failed_data["incompletePartIds"] == [encode_uuid(part_id) for part_id in part_ids]


@pytest.mark.asyncio
async def test_cursor_conflict_and_invalid_cursor_fail_before_sse(prepared_db) -> None:
    _ = prepared_db
    repository, thread, run_id, created = await _run()
    await repository.append_event(event=_queued(run_id=run_id, thread_id=thread.id))
    service = AgentRunStreamService()

    with pytest.raises(BadRequest) as conflict:
        await service.prepare_stream(
            workspace_id=thread.workspace_id,
            owner_user_id=thread.owner_user_id,
            run_id=run_id,
            query_cursor=created.cursor,
            last_event_id="different-cursor",
        )
    assert conflict.value.error == "AGENT_RUN_CURSOR_CONFLICT"

    with pytest.raises(BadRequest) as invalid:
        await service.prepare_stream(
            workspace_id=thread.workspace_id,
            owner_user_id=thread.owner_user_id,
            run_id=run_id,
            query_cursor="foreign-or-malformed-cursor",
            last_event_id=None,
        )
    assert invalid.value.error == "AGENT_RUN_CURSOR_INVALID"

    with pytest.raises(NotFound) as hidden_before_cursor_validation:
        await service.prepare_stream(
            workspace_id=thread.workspace_id,
            owner_user_id=uuid4(),
            run_id=run_id,
            query_cursor="foreign-or-malformed-cursor",
            last_event_id=None,
        )
    assert hidden_before_cursor_validation.value.error == "AGENT_RUN_NOT_FOUND"


@pytest.mark.asyncio
async def test_expired_cursor_returns_inline_authorized_snapshot(prepared_db) -> None:
    _ = prepared_db
    repository, thread, run_id, created = await _run()
    queued = _queued(run_id=run_id, thread_id=thread.id)
    await repository.append_event(event=queued)
    run = await AgentRunV1Record.get(id=run_id)
    run.minimum_replay_sequence = 2
    run.minimum_replay_cursor = created.cursor
    await run.save(update_fields=["minimum_replay_sequence", "minimum_replay_cursor", "updated_at"])
    service = AgentRunStreamService()

    with pytest.raises(APIError) as expired:
        await service.prepare_stream(
            workspace_id=thread.workspace_id,
            owner_user_id=thread.owner_user_id,
            run_id=run_id,
            query_cursor=None,
            last_event_id=None,
        )
    assert expired.value.status_code == 410
    assert expired.value.error == "EVENT_CURSOR_EXPIRED"
    assert expired.value.meta is not None
    assert expired.value.meta["minimumReplaySequence"] == 2
    assert expired.value.meta["snapshot"]["lastSequence"] == 2

    resumed = await service.prepare_stream(
        workspace_id=thread.workspace_id,
        owner_user_id=thread.owner_user_id,
        run_id=run_id,
        query_cursor=created.cursor,
        last_event_id=created.cursor,
    )
    assert resumed.start_sequence == 1
    assert resumed.last_sequence == 2
