from __future__ import annotations

from uuid import uuid4

import pytest

from src.models.agents.runtime_delegation_v1 import AgentDelegationV1Record
from src.models.agents.runtime_v1 import AgentRunEventV1Record, AgentRunStatusV1, AgentRunV1Record, AgentThreadV1Record
from src.models.organization.organization import Organization, OrganizationKind
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.runtime_delegation_protocol_schema import (
    DelegationCompletedEventV1,
    DelegationDelegatedEventV1,
)
from src.modules.ai.runtime_protocol_schema import MessagePartStartedEventV1, RunCreatedEventV1, RunStartedEventV1
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from tests.modules.ai.runtime_agent_test_ids import (
    TEST_LEAD_AGENT_ASSIGNMENT_ID,
    TEST_LEAD_AGENT_ID,
    TEST_LEAD_AGENT_VERSION_ID,
)

pytestmark = pytest.mark.integration


def _event(envelope: dict[str, object], event_type: str, sequence: int, data: dict[str, object]) -> dict[str, object]:
    return {
        **envelope,
        "eventId": f"event-delegation-{sequence}",
        "cursor": f"cursor-delegation-{sequence}",
        "type": event_type,
        "sequence": sequence,
        "occurredAt": f"2026-07-19T06:00:{sequence:02d}.000Z",
        "data": data,
    }


@pytest.mark.asyncio
async def test_delegation_projection_owns_child_identity_nested_messages_and_source_replay(prepared_db) -> None:
    _ = prepared_db
    owner_id = uuid4()
    organization = await Organization.create(
        slug=f"delegation-org-{uuid4().hex[:10]}",
        name="Delegation Org",
        kind=OrganizationKind.TEAM,
        owner_user_id=owner_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Delegation Workspace",
        is_active=True,
        created_by_user_id=owner_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"delegation-project-{uuid4().hex[:10]}",
        name="Delegation Project",
        is_active=True,
        created_by_user_id=owner_id,
    )
    thread = await AgentThreadV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        owner_user_id=owner_id,
        lead_agent_id=str(TEST_LEAD_AGENT_ID),
        lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
        lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
        title="Delegation",
    )
    run_id = uuid4()
    correlation_id = "correlation-delegation"
    envelope: dict[str, object] = {
        "eventVersion": 1,
        "runId": str(run_id),
        "threadId": str(thread.id),
        "correlationId": correlation_id,
        "spanId": "span-delegation",
        "parentSpanId": "span-tool",
    }
    repository = AgentRuntimeRepository()
    command = AgentRunCreatePersistenceCommand(
        run_id=run_id,
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        owner_user_id=owner_id,
        lead_agent_id=TEST_LEAD_AGENT_ID,
        lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
        lead_agent_assignment_id=TEST_LEAD_AGENT_ASSIGNMENT_ID,
        execution_mode="build",
        site_revision_id=None,
        message="Delegate conversion analysis.",
        idempotency_key="delegation-parent-run",
        correlation_id=correlation_id,
    )
    created = RunCreatedEventV1.model_validate(
        _event(
            {**envelope, "spanId": None, "parentSpanId": None},
            "run.created",
            1,
            {
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
            "run.started",
            2,
            {"startedAt": "2026-07-19T06:00:02.000Z", "attemptNumber": 1, "agentVersionId": "agent-version-lead"},
        )
    )
    await repository.create_run_with_first_event(command=command, event=created)
    await repository.append_event(event=started)
    message_id, part_id, child_run_id = uuid4(), uuid4(), uuid4()
    part_started = MessagePartStartedEventV1.model_validate(
        _event(
            envelope,
            "message.part.started",
            3,
            {
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
                    "toolCallId": "tool-call-delegate-1",
                    "toolName": "agent.delegate",
                    "args": {"objective": "Analyze conversion"},
                    "argsText": '{"objective":"Analyze conversion"}',
                },
            },
        )
    )
    await repository.append_event(event=part_started)
    await AgentRunV1Record.create(
        id=child_run_id,
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        owner_user_id=owner_id,
        idempotency_key="delegation-child-run",
        execution_mode="build",
        lead_agent_id="agent-analyst",
        mentioned_agent_ids=[],
        status=AgentRunStatusV1.RUNNING,
        correlation_id=correlation_id,
        last_sequence=0,
    )
    delegated = DelegationDelegatedEventV1.model_validate(
        _event(
            envelope,
            "delegation.delegated",
            4,
            {
                "delegationId": "delegation-1",
                "parentToolCallId": "tool-call-delegate-1",
                "childRunId": str(child_run_id),
                "sourceAgentVersionId": "agent-version-lead",
                "targetAgentVersionId": "agent-version-analyst",
                "delegatedAt": "2026-07-19T06:00:04.000Z",
                "objectiveSummary": "Analyze conversion data.",
            },
        )
    )
    await repository.append_event(event=delegated)
    nested = MessagePartStartedEventV1.model_validate(
        _event(
            envelope,
            "message.part.started",
            5,
            {
                "message": {
                    "messageId": str(uuid4()),
                    "role": "assistant",
                    "agentId": "agent-analyst",
                    "createdAt": "2026-07-19T06:00:05.000Z",
                    "placement": {
                        "kind": "delegation",
                        "delegationId": "delegation-1",
                        "parentToolCallId": "tool-call-delegate-1",
                        "sourceRunId": str(child_run_id),
                    },
                },
                "part": {
                    "partId": str(uuid4()),
                    "partIndex": 0,
                    "type": "text",
                    "status": "running",
                    "text": "Analysis",
                },
            },
        )
    )
    await repository.append_event(event=nested)
    child = await AgentRunV1Record.get(id=child_run_id)
    child.status = AgentRunStatusV1.COMPLETED
    await child.save(update_fields=["status", "updated_at"])
    completed = DelegationCompletedEventV1.model_validate(
        _event(
            envelope,
            "delegation.completed",
            6,
            {
                "delegationId": "delegation-1",
                "childRunId": str(child_run_id),
                "completedAt": "2026-07-19T06:01:00.000Z",
                "artifactRefs": [{"artifactId": "artifact-analysis-1"}],
                "summary": "Analysis completed.",
            },
        )
    )
    first = await repository.append_delegation_projection(event=completed, source_event_id="child-event-terminal-1")
    replay = await repository.append_delegation_projection(event=completed, source_event_id="child-event-terminal-1")
    delegation = await AgentDelegationV1Record.get(delegation_id="delegation-1")
    event = await AgentRunEventV1Record.get(event_id=completed.event_id)
    assert first == replay
    assert str(delegation.status) == "completed"
    assert delegation.artifact_refs == [{"artifactId": "artifact-analysis-1"}]
    assert event.source_event_id == "child-event-terminal-1"
