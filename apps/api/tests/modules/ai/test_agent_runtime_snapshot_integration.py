from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.utils.public_ids import encode_uuid
from src.models.agents.runtime_delegation_v1 import AgentDelegationStatusV1, AgentDelegationV1Record
from src.models.agents.runtime_output_v1 import AgentChangeSetV1Record
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
)
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.runtime_output_protocol_schema import UsageUpdatedEventV1
from src.modules.ai.runtime_protocol_schema import MessagePartStartedEventV1, RunCreatedEventV1, RunStartedEventV1
from src.modules.ai.runtime_repository import AgentRuntimePersistenceError, AgentRuntimeRepository
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from src.modules.ai.runtime_snapshot_repository import AgentRunSnapshotRepository
from src.modules.ai.runtime_snapshot_schema import AgentRunSnapshotScopeV1
from tests.modules.ai.runtime_agent_test_ids import (
    TEST_LEAD_AGENT_ASSIGNMENT_ID,
    TEST_LEAD_AGENT_ID,
    TEST_LEAD_AGENT_VERSION_ID,
)
from tests.modules.ai.runtime_design_system_test_context import fixed_design_system_context

pytestmark = pytest.mark.integration


def _event(
    envelope: dict[str, object],
    *,
    event_type: str,
    sequence: int,
    data: dict[str, object],
) -> dict[str, object]:
    return {
        **envelope,
        "eventId": f"event-snapshot-{sequence}",
        "cursor": f"cursor-snapshot-{sequence}",
        "type": event_type,
        "sequence": sequence,
        "occurredAt": f"2026-07-19T07:00:{sequence:02d}.000Z",
        "data": data,
    }


async def _running_run() -> tuple[
    AgentRuntimeRepository,
    Workspace,
    ProjectRecord,
    AgentThreadV1Record,
    AgentRunV1Record,
    dict[str, object],
]:
    owner_id = uuid4()
    organization = await Organization.create(
        slug=f"snapshot-org-{uuid4().hex[:10]}",
        name="Snapshot Org",
        owner_user_id=owner_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Snapshot Workspace",
        is_active=True,
        owner_user_id=owner_id,
        created_by_user_id=owner_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"snapshot-project-{uuid4().hex[:10]}",
        name="Snapshot Project",
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
        title="Snapshot recovery",
    )
    run_id = uuid4()
    envelope: dict[str, object] = {
        "eventVersion": 1,
        "runId": str(run_id),
        "threadId": str(thread.id),
        "correlationId": f"correlation-snapshot-{run_id}",
        "spanId": None,
        "parentSpanId": None,
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
        design_system_context=fixed_design_system_context(project.id),
        execution_mode="build",
        site_revision_id=None,
        message="Create the pricing page.",
        idempotency_key=f"snapshot-run-{run_id}",
        correlation_id=str(envelope["correlationId"]),
    )
    created = RunCreatedEventV1.model_validate(
        _event(
            envelope,
            event_type="run.created",
            sequence=1,
            data={
                "run": {
                    "status": "created",
                    "executionMode": "build",
                    "leadAgentId": str(TEST_LEAD_AGENT_ID),
                    "createdAt": "2026-07-19T07:00:01.000Z",
                }
            },
        )
    )
    started = RunStartedEventV1.model_validate(
        _event(
            envelope,
            event_type="run.started",
            sequence=2,
            data={
                "startedAt": "2026-07-19T07:00:02.000Z",
                "attemptNumber": 1,
                "agentVersionId": "agent-version-lead",
            },
        )
    )
    await repository.create_run_with_first_event(command=command, event=created)
    await repository.append_event(event=started)
    run = await AgentRunV1Record.get(id=run_id)
    return repository, workspace, project, thread, run, envelope


def _scope(
    *,
    workspace: Workspace,
    project: ProjectRecord,
    thread: AgentThreadV1Record,
    run: AgentRunV1Record,
    owner_user_id: UUID | None = None,
) -> AgentRunSnapshotScopeV1:
    return AgentRunSnapshotScopeV1(
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        run_id=run.id,
        owner_user_id=owner_user_id or thread.owner_user_id,
    )


@pytest.mark.asyncio
async def test_snapshot_projects_role_identity_messages_and_authorized_high_water(prepared_db) -> None:
    _ = prepared_db
    repository, workspace, project, thread, run, envelope = await _running_run()
    assistant_message_id = uuid4()
    assistant_part_id = uuid4()
    await repository.append_event(
        event=MessagePartStartedEventV1.model_validate(
            _event(
                envelope,
                event_type="message.part.started",
                sequence=3,
                data={
                    "message": {
                        "messageId": str(assistant_message_id),
                        "role": "assistant",
                        "agentId": "agent-lead",
                        "createdAt": "2026-07-19T07:00:03.000Z",
                        "placement": {"kind": "thread"},
                    },
                    "part": {
                        "partId": str(assistant_part_id),
                        "partIndex": 0,
                        "type": "text",
                        "status": "running",
                        "text": "Drafting pricing",
                    },
                },
            )
        )
    )
    snapshot = await repository.get_snapshot(scope=_scope(workspace=workspace, project=project, thread=thread, run=run))
    assert snapshot.last_sequence == 3
    assert snapshot.last_cursor == "cursor-snapshot-3"
    assert snapshot.minimum_replay_sequence == 1
    assert snapshot.minimum_replay_cursor is None
    assert snapshot.terminal is False
    user_message, assistant_message = snapshot.messages
    assert user_message.role == "user"
    assert user_message.actor_user_id == thread.owner_user_id
    assert user_message.agent_id is None
    assert user_message.parts[0].text == "Create the pricing page."
    assert assistant_message.role == "assistant"
    assert assistant_message.agent_id == "agent-lead"
    assert assistant_message.actor_user_id is None
    assert assistant_message.parts[0].text == "Drafting pricing"
    serialized = snapshot.model_dump(by_alias=True, mode="json")
    assert serialized["runId"] == encode_uuid(run.id)
    assert serialized["threadId"] == encode_uuid(thread.id)
    assert serialized["thread"] == {
        "threadId": encode_uuid(thread.id),
        "workspaceId": encode_uuid(workspace.id),
        "projectId": encode_uuid(project.id),
        "ownerUserId": encode_uuid(thread.owner_user_id),
        "leadAgentId": encode_uuid(TEST_LEAD_AGENT_ID),
        "leadAgentVersionId": encode_uuid(TEST_LEAD_AGENT_VERSION_ID),
        "leadAgentAssignmentId": encode_uuid(TEST_LEAD_AGENT_ASSIGNMENT_ID),
        "title": "Snapshot recovery",
        "archivedAt": None,
        "createdAt": serialized["thread"]["createdAt"],
        "updatedAt": serialized["thread"]["updatedAt"],
    }
    assert serialized["run"]["runId"] == encode_uuid(run.id)
    assert serialized["run"]["workspaceId"] == encode_uuid(workspace.id)
    assert serialized["run"]["projectId"] == encode_uuid(project.id)
    assert serialized["run"]["threadId"] == encode_uuid(thread.id)
    assert serialized["run"]["ownerUserId"] == encode_uuid(thread.owner_user_id)
    assert serialized["designSystemContext"]["projectId"] == encode_uuid(project.id)
    assert serialized["designSystemContext"]["assignmentRevision"] == 1
    assert serialized["designSystemContext"]["contextHash"] == f"sha256:{'4' * 64}"
    assert serialized["messages"][0]["actorUserId"] == encode_uuid(thread.owner_user_id)
    assert serialized["messages"][1]["messageId"] == encode_uuid(assistant_message_id)
    assert serialized["messages"][1]["parts"][0]["partId"] == encode_uuid(assistant_part_id)
    with pytest.raises(AgentRuntimePersistenceError, match="AGENT_RUN_NOT_FOUND"):
        await repository.get_snapshot(
            scope=_scope(
                workspace=workspace,
                project=project,
                thread=thread,
                run=run,
                owner_user_id=uuid4(),
            )
        )


class _PausingSnapshotRepository(AgentRunSnapshotRepository):
    def __init__(self, *, locked: asyncio.Event, release: asyncio.Event) -> None:
        self._locked = locked
        self._release = release

    async def _messages(
        self,
        *,
        run: AgentRunV1Record,
        conn: BaseDBAsyncClient,
    ):
        self._locked.set()
        await self._release.wait()
        return await super()._messages(run=run, conn=conn)


@pytest.mark.asyncio
async def test_snapshot_transaction_has_no_gap_with_concurrent_event_append(prepared_db) -> None:
    _ = prepared_db
    repository, workspace, project, thread, run, envelope = await _running_run()
    locked = asyncio.Event()
    release = asyncio.Event()
    snapshot_repository = AgentRuntimeRepository(
        snapshot_repository=_PausingSnapshotRepository(locked=locked, release=release)
    )
    snapshot_task = asyncio.create_task(
        snapshot_repository.get_snapshot(scope=_scope(workspace=workspace, project=project, thread=thread, run=run))
    )
    await locked.wait()
    usage_event = UsageUpdatedEventV1.model_validate(
        _event(
            envelope,
            event_type="usage.updated",
            sequence=3,
            data={
                "usage": {
                    "provider": "openai",
                    "model": "gpt-5",
                    "inputTokens": 20,
                    "outputTokens": 5,
                    "totalTokens": 25,
                    "settlement": "provisional",
                },
                "providerOccurredAt": "2026-07-19T07:00:03.000Z",
            },
        )
    )
    append_task = asyncio.create_task(repository.append_event(event=usage_event))
    with pytest.raises(TimeoutError):
        await asyncio.wait_for(asyncio.shield(append_task), timeout=0.1)
    release.set()
    snapshot = await snapshot_task
    await append_task
    latest = await repository.get_snapshot(scope=_scope(workspace=workspace, project=project, thread=thread, run=run))
    assert snapshot.last_sequence == 2
    assert snapshot.usage is None
    assert latest.last_sequence == 3
    assert latest.usage is not None
    assert latest.usage.total_tokens == 25


@pytest.mark.asyncio
async def test_snapshot_restores_pending_authority_nested_messages_and_artifacts(prepared_db) -> None:
    _ = prepared_db
    repository, workspace, project, thread, run, _ = await _running_run()
    message = await AgentMessageV1Record.create(
        thread_id=thread.id,
        run_id=run.id,
        role="assistant",
        status="running",
        agent_id="agent-lead",
        placement_kind="thread",
    )
    part = await AgentMessagePartV1Record.create(
        message_id=message.id,
        part_index=0,
        type="tool-call",
        status="requires_action",
        tool_call_id="tool-call-snapshot",
        payload={
            "partId": str(uuid4()),
            "partIndex": 0,
            "type": "tool-call",
            "status": "requires_action",
            "toolCallId": "tool-call-snapshot",
            "toolName": "agent.delegate",
            "args": {"objective": "Analyze conversion"},
            "argsText": '{"objective":"Analyze conversion"}',
            "artifactRefs": [{"artifactId": "artifact-shared"}],
        },
    )
    now = datetime.now(UTC)
    await AgentApprovalV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        run_id=run.id,
        message_part_id=part.id,
        owner_user_id=thread.owner_user_id,
        approval_id="approval-snapshot",
        approval_version=1,
        tool_call_id="tool-call-snapshot",
        checkpoint_id="checkpoint-snapshot",
        status=AgentApprovalStatusV1.PENDING,
        requested_at=now,
        expires_at=now + timedelta(minutes=10),
        policy_version="policy-v1",
        risk={
            "sideEffectClass": "external_write",
            "summaryKey": "agents.approval.snapshot",
            "summaryParams": {},
            "previewRef": None,
        },
        options=[
            {
                "id": "allow_once",
                "kind": "allow-once",
                "labelKey": "agents.approval.allowOnce",
                "descriptionKey": "agents.approval.allowOnceDescription",
                "grants": [],
                "confirm": True,
            }
        ],
    )
    child = await AgentRunV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        owner_user_id=thread.owner_user_id,
        idempotency_key=f"snapshot-child-{uuid4()}",
        execution_mode="build",
        lead_agent_id="agent-analyst",
        status=AgentRunStatusV1.RUNNING,
        correlation_id=run.correlation_id,
    )
    await AgentDelegationV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        parent_run_id=run.id,
        child_run_id=child.id,
        parent_message_part_id=part.id,
        owner_user_id=thread.owner_user_id,
        delegation_id="delegation-snapshot",
        parent_tool_call_id="tool-call-snapshot",
        source_agent_version_id="agent-version-lead",
        target_agent_version_id="agent-version-analyst",
        status=AgentDelegationStatusV1.COMPLETED,
        delegated_at=now,
        completed_at=now,
        objective_summary="Analyze conversion.",
        summary="Conversion analysis is ready.",
        artifact_refs=[{"artifactId": "artifact-shared"}, {"artifactId": "artifact-analysis"}],
    )
    await AgentMessageV1Record.create(
        thread_id=thread.id,
        run_id=run.id,
        role="assistant",
        status="complete",
        agent_id="agent-analyst",
        placement_kind="delegation",
        delegation_id="delegation-snapshot",
        parent_tool_call_id="tool-call-snapshot",
        source_run_id=str(child.id),
    )
    await AgentChangeSetV1Record.create(
        workspace_id=workspace.id,
        project_id=project.id,
        thread_id=thread.id,
        run_id=run.id,
        change_set_id="changeset-snapshot",
        base_revision_id="revision-1",
        preview_ref="artifact://changeset-snapshot",
        summary_key="AI_CHANGESET_SNAPSHOT",
        summary_params={"page": "pricing"},
        warnings=[],
        required_approval_ids=["approval-snapshot"],
    )
    snapshot = await repository.get_snapshot(scope=_scope(workspace=workspace, project=project, thread=thread, run=run))
    assert snapshot.pending_approvals[0].approval_id == "approval-snapshot"
    assert snapshot.delegations[0].delegation_id == "delegation-snapshot"
    nested = next(item for item in snapshot.messages if item.placement["kind"] == "delegation")
    assert nested.placement["sourceRunId"] == encode_uuid(child.id)
    assert snapshot.change_sets[0].change_set_id == "changeset-snapshot"
    assert [item.artifact_id for item in snapshot.artifact_refs] == ["artifact-shared", "artifact-analysis"]
    serialized = snapshot.model_dump(by_alias=True, mode="json")
    assert serialized["pendingApprovals"][0]["messageId"] == encode_uuid(message.id)
    assert serialized["pendingApprovals"][0]["partId"] == encode_uuid(part.id)
    assert serialized["delegations"][0]["childRunId"] == encode_uuid(child.id)
