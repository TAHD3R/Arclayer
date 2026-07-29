from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.agents.runtime_v1 import (
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunEventV1Record,
    AgentRunV1Record,
    AgentThreadV1Record,
    AgentToolResponseV1Record,
)
from src.models.jobs.background_job import BackgroundJobRecord
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.projects.project import ProjectRecord
from src.models.system.rbac import SystemRole
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.modules.ai.runtime_approval_protocol_schema import RunInterruptedEventV1
from src.modules.ai.runtime_output_protocol_schema import RunFailedEventV1
from src.modules.ai.runtime_protocol_schema import (
    MessagePartStartedEventV1,
    RunCreatedEventV1,
    RunStartedEventV1,
)
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.workspaces.rbac.service import WorkspaceRBACService
from tests.modules.ai.runtime_agent_test_ids import TEST_LEAD_AGENT_ID, TEST_LEAD_AGENT_VERSION_ID

pytestmark = pytest.mark.integration


async def _user(*, label: str) -> User:
    settings = get_settings()
    return await UserRepository().create_user(
        username=f"agent_{label}_{uuid4().hex[:8]}",
        email=f"agent_{label}_{uuid4().hex[:8]}@example.com",
        display_name=f"Agent {label.title()}",
        password_hash=hash_password("agent_thread_password_123", settings.auth),
    )


async def _create_failed_run(
    *,
    workspace: Workspace,
    project: ProjectRecord,
    thread_id: UUID,
    owner_user_id: UUID,
) -> UUID:
    run_id = uuid4()
    created = RunCreatedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "endpoint-run-created",
        "cursor": "endpoint-cursor-created",
        "type": "run.created",
        "runId": str(run_id),
        "threadId": str(thread_id),
        "sequence": 1,
        "occurredAt": "2026-07-19T12:00:00Z",
        "correlationId": "endpoint-run-correlation",
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
    failed = RunFailedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "endpoint-run-failed",
        "cursor": "endpoint-cursor-failed",
        "type": "run.failed",
        "runId": str(run_id),
        "threadId": str(thread_id),
        "sequence": 2,
        "occurredAt": "2026-07-19T12:00:01Z",
        "correlationId": "endpoint-run-correlation",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "failedAt": "2026-07-19T12:00:01Z",
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
    repository = AgentRuntimeRepository()
    thread = await AgentThreadV1Record.get(id=thread_id)
    await repository.create_run_with_first_event(
        command=AgentRunCreatePersistenceCommand(
            run_id=run_id,
            workspace_id=workspace.id,
            project_id=project.id,
            thread_id=thread_id,
            owner_user_id=owner_user_id,
            lead_agent_id=TEST_LEAD_AGENT_ID,
            lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
            lead_agent_assignment_id=thread.lead_agent_assignment_id,
            execution_mode="plan",
            site_revision_id=None,
            message="Plan the homepage.",
            idempotency_key="endpoint-run-command",
            correlation_id="endpoint-run-correlation",
        ),
        event=created,
    )
    await repository.append_event(event=failed)
    return run_id


async def _create_human_interrupt_run(
    *,
    workspace: Workspace,
    project: ProjectRecord,
    thread_id: UUID,
    owner_user_id: UUID,
) -> UUID:
    run_id = uuid4()
    correlation_id = "endpoint-human-interrupt"
    envelope = {
        "eventVersion": 1,
        "runId": str(run_id),
        "threadId": str(thread_id),
        "correlationId": correlation_id,
        "spanId": None,
        "parentSpanId": None,
    }
    created = RunCreatedEventV1.model_validate({
        **envelope,
        "eventId": "endpoint-human-created",
        "cursor": "endpoint-human-cursor-created",
        "type": "run.created",
        "sequence": 1,
        "occurredAt": "2026-07-19T12:10:00Z",
        "data": {
            "run": {
                "status": "created",
                "executionMode": "build",
                "leadAgentId": str(TEST_LEAD_AGENT_ID),
                "createdAt": "2026-07-19T12:10:00Z",
            }
        },
    })
    started = RunStartedEventV1.model_validate({
        **envelope,
        "eventId": "endpoint-human-started",
        "cursor": "endpoint-human-cursor-started",
        "type": "run.started",
        "sequence": 2,
        "occurredAt": "2026-07-19T12:10:01Z",
        "data": {
            "startedAt": "2026-07-19T12:10:01Z",
            "attemptNumber": 1,
            "agentVersionId": "agent-lead:v1",
        },
    })
    message_id = uuid4()
    part_id = uuid4()
    part_started = MessagePartStartedEventV1.model_validate({
        **envelope,
        "spanId": "endpoint-human-span",
        "parentSpanId": "endpoint-human-parent",
        "eventId": "endpoint-human-part",
        "cursor": "endpoint-human-cursor-part",
        "type": "message.part.started",
        "sequence": 3,
        "occurredAt": "2026-07-19T12:10:02Z",
        "data": {
            "message": {
                "messageId": str(message_id),
                "role": "assistant",
                "agentId": "agent-lead",
                "createdAt": "2026-07-19T12:10:02Z",
                "placement": {"kind": "thread"},
            },
            "part": {
                "partId": str(part_id),
                "partIndex": 0,
                "type": "tool-call",
                "status": "running",
                "toolCallId": "endpoint-human-tool-call",
                "toolName": "human.choose",
                "args": {"questionKey": "agents.questions.chooseAudience"},
                "argsText": '{"questionKey":"agents.questions.chooseAudience"}',
            },
        },
    })
    interrupted = RunInterruptedEventV1.model_validate({
        **envelope,
        "spanId": "endpoint-human-span",
        "parentSpanId": "endpoint-human-parent",
        "eventId": "endpoint-human-interrupted",
        "cursor": "endpoint-human-cursor-interrupted",
        "type": "run.interrupted",
        "sequence": 4,
        "occurredAt": "2026-07-19T12:10:03Z",
        "data": {
            "interruptId": "endpoint-human-interrupt-id",
            "checkpointId": "endpoint-human-checkpoint",
            "reason": "human_tool_input",
            "toolCallId": "endpoint-human-tool-call",
        },
    })
    repository = AgentRuntimeRepository()
    thread = await AgentThreadV1Record.get(id=thread_id)
    await repository.create_run_with_first_event(
        command=AgentRunCreatePersistenceCommand(
            run_id=run_id,
            workspace_id=workspace.id,
            project_id=project.id,
            thread_id=thread_id,
            owner_user_id=owner_user_id,
            lead_agent_id=TEST_LEAD_AGENT_ID,
            lead_agent_version_id=TEST_LEAD_AGENT_VERSION_ID,
            lead_agent_assignment_id=thread.lead_agent_assignment_id,
            execution_mode="build",
            site_revision_id=None,
            message="Choose the homepage audience.",
            idempotency_key="endpoint-human-command",
            correlation_id=correlation_id,
        ),
        event=created,
    )
    await repository.append_event(event=started)
    await repository.append_event(event=part_started)
    await repository.append_event(event=interrupted)
    return run_id


async def test_workspace_thread_endpoints_enforce_rbac_owner_scope_and_soft_delete(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await _user(label="owner")
        viewer = await _user(label="viewer")
        organization = await Organization.create(
            slug=f"agent-thread-http-{uuid4().hex[:10]}",
            name="Agent Thread HTTP Org",
            owner_user_id=owner.id,
            is_active=True,
        )
        await OrgMembership.create(
            organization_id=organization.id,
            user_id=owner.id,
            role=OrgRole.OWNER,
            role_code=OrgRole.OWNER.value,
            status="active",
        )
        await OrgMembership.create(
            organization_id=organization.id,
            user_id=viewer.id,
            role=OrgRole.MEMBER,
            role_code=OrgRole.MEMBER.value,
            status="active",
        )
        workspace = await Workspace.create(
            organization_id=organization.id,
            name="Agent Thread HTTP Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )
        project = await ProjectRecord.create(
            workspace_id=workspace.id,
            slug=f"agent-thread-http-project-{uuid4().hex[:8]}",
            name="Agent Thread HTTP Project",
            is_active=True,
            created_by_user_id=owner.id,
        )
        await WorkspaceRBACService(settings).ensure_workspace_rbac_ready(workspace_id=workspace.id)
        owner_membership = await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=owner.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        viewer_membership = await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=viewer.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=owner.id,
        )
        owner_role = await SystemRole.get(workspace_id=workspace.id, code="owner")
        viewer_role = await SystemRole.get(workspace_id=workspace.id, code="viewer")
        await WorkspaceMembershipRole.create(membership_id=owner_membership.id, role_id=owner_role.id)
        await WorkspaceMembershipRole.create(membership_id=viewer_membership.id, role_id=viewer_role.id)

        current_user: User = owner

        async def _get_user() -> User:
            return current_user

        async def _get_user_id() -> UUID:
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        workspace_id = encode_uuid(workspace.id)
        project_id = encode_uuid(project.id)
        base_url = f"/api/v1/workspaces/{workspace_id}/ai/threads"
        payload = {
            "projectId": project_id,
            "leadAgentId": encode_uuid(TEST_LEAD_AGENT_ID),
            "title": "Homepage collaboration",
        }

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_headers = {"Idempotency-Key": "http-thread-create-1"}
            created = await client.post(base_url, headers=create_headers, json=payload)
            assert created.status_code == 201, created.text
            thread_id = created.json()["data"]["threadId"]
            assert len(thread_id) == 22
            thread_uuid = decode_public_id(thread_id)

            replayed = await client.post(base_url, headers=create_headers, json=payload)
            assert replayed.status_code == 201, replayed.text
            assert replayed.json()["data"] == created.json()["data"]
            conflicting_thread = await client.post(
                base_url,
                headers=create_headers,
                json={**payload, "title": "Different command"},
            )
            assert conflicting_thread.status_code == 409, conflicting_thread.text
            assert conflicting_thread.json()["error"] == "AGENT_THREAD_IDEMPOTENCY_CONFLICT"

            run_create_url = f"{base_url}/{thread_id}/runs"
            run_payload = {
                "projectId": project_id,
                "leadAgentId": encode_uuid(TEST_LEAD_AGENT_ID),
                "executionMode": "plan",
                "message": "Plan the homepage information architecture.",
            }
            queued_run = await client.post(
                run_create_url,
                headers={"Idempotency-Key": "http-run-create-1"},
                json=run_payload,
            )
            assert queued_run.status_code == 202, queued_run.text
            queued_run_id = queued_run.json()["data"]["runId"]
            assert len(queued_run_id) == 22
            queued_run_uuid = decode_public_id(queued_run_id)
            assert queued_run.json()["data"]["status"] == "queued"
            assert queued_run.json()["data"]["lastSequence"] == 2
            replayed_run = await client.post(
                run_create_url,
                headers={"Idempotency-Key": "http-run-create-1"},
                json=run_payload,
            )
            assert replayed_run.status_code == 202, replayed_run.text
            assert replayed_run.json()["data"] == queued_run.json()["data"]
            conflicting_run = await client.post(
                run_create_url,
                headers={"Idempotency-Key": "http-run-create-1"},
                json={**run_payload, "message": "Different command"},
            )
            assert conflicting_run.status_code == 409, conflicting_run.text
            assert conflicting_run.json()["error"] == "AGENT_RUN_IDEMPOTENCY_CONFLICT"

            cancel_url = f"/api/v1/workspaces/{workspace_id}/ai/runs/{encode_uuid(queued_run_uuid)}/cancel"
            cancelled_run = await client.post(cancel_url)
            assert cancelled_run.status_code == 200, cancelled_run.text
            assert cancelled_run.json()["data"]["run"]["status"] == "cancelled"
            assert cancelled_run.json()["data"]["terminal"] is True
            assert cancelled_run.json()["data"]["lastSequence"] == 4
            replayed_cancel = await client.post(cancel_url)
            assert replayed_cancel.status_code == 200, replayed_cancel.text
            assert replayed_cancel.json()["data"] == cancelled_run.json()["data"]
            persisted_queued_run = await AgentRunV1Record.get(id=queued_run_uuid)
            queued_job = await BackgroundJobRecord.get(id=persisted_queued_run.job_id)
            queued_events = await AgentRunEventV1Record.filter(run_id=queued_run_uuid).order_by("sequence")
            assert [event.type for event in queued_events] == [
                "run.created",
                "run.queued",
                "run.cancel.requested",
                "run.cancelled",
            ]
            assert queued_job.cancel_requested_by_user_id == owner.id
            assert queued_job.cancel_reason == "agent_run_user_requested"

            listed = await client.get(base_url, params={"projectId": project_id})
            assert listed.status_code == 200, listed.text
            assert [item["threadId"] for item in listed.json()["data"]["items"]] == [thread_id]

            updated = await client.patch(f"{base_url}/{thread_id}", json={"archived": True})
            assert updated.status_code == 200, updated.text
            assert updated.json()["data"]["archivedAt"] is not None

            run_uuid = await _create_failed_run(
                workspace=workspace,
                project=project,
                thread_id=thread_uuid,
                owner_user_id=owner.id,
            )
            run_id = encode_uuid(run_uuid)
            run_url = f"/api/v1/workspaces/{workspace_id}/ai/runs/{run_id}"
            snapshot = await client.get(run_url)
            assert snapshot.status_code == 200, snapshot.text
            snapshot_data = snapshot.json()["data"]
            persisted_message = await AgentMessageV1Record.get(run_id=run_uuid)
            persisted_part = await AgentMessagePartV1Record.get(message_id=persisted_message.id)
            assert snapshot_data["runId"] == run_id
            assert snapshot_data["threadId"] == thread_id
            assert snapshot_data["thread"]["threadId"] == thread_id
            assert snapshot_data["thread"]["workspaceId"] == workspace_id
            assert snapshot_data["thread"]["projectId"] == project_id
            assert snapshot_data["thread"]["ownerUserId"] == encode_uuid(owner.id)
            assert snapshot_data["run"]["runId"] == run_id
            assert snapshot_data["run"]["workspaceId"] == workspace_id
            assert snapshot_data["run"]["projectId"] == project_id
            assert snapshot_data["run"]["threadId"] == thread_id
            assert snapshot_data["run"]["ownerUserId"] == encode_uuid(owner.id)
            assert snapshot_data["messages"][0]["messageId"] == encode_uuid(persisted_message.id)
            assert snapshot_data["messages"][0]["actorUserId"] == encode_uuid(owner.id)
            assert snapshot_data["messages"][0]["parts"][0]["partId"] == encode_uuid(persisted_part.id)
            assert snapshot_data["terminal"] is True
            terminal_cancel = await client.post(f"{run_url}/cancel")
            assert terminal_cancel.status_code == 200, terminal_cancel.text
            assert terminal_cancel.json()["data"] == snapshot.json()["data"]
            events = await client.get(f"{run_url}/events")
            assert events.status_code == 200, events.text
            assert events.headers["content-type"].startswith("text/event-stream")
            assert events.text.count("event: agent.run.event") == 2
            assert '"type":"run.failed"' in events.text

            human_run_id = await _create_human_interrupt_run(
                workspace=workspace,
                project=project,
                thread_id=thread_uuid,
                owner_user_id=owner.id,
            )
            thread_detail = await client.get(f"{base_url}/{thread_id}")
            assert thread_detail.status_code == 200, thread_detail.text
            assert thread_detail.json()["data"]["activeRunId"] == encode_uuid(human_run_id)
            tool_response_url = f"/api/v1/workspaces/{workspace_id}/ai/tool-calls/endpoint-human-tool-call/responses"
            tool_response_payload = {
                "kind": "human_result",
                "checkpointId": "endpoint-human-checkpoint",
                "result": {"audience": "design teams"},
            }
            tool_response_headers = {"Idempotency-Key": "endpoint-human-response-command"}
            tool_response = await client.post(
                tool_response_url,
                headers=tool_response_headers,
                json=tool_response_payload,
            )
            assert tool_response.status_code == 200, tool_response.text
            tool_response_id = tool_response.json()["data"]["responseId"]
            assert len(tool_response_id) == 22
            assert tool_response.json()["data"] == {
                "protocolVersion": 1,
                "responseId": tool_response_id,
                "toolCallId": "endpoint-human-tool-call",
                "checkpointId": "endpoint-human-checkpoint",
                "responseKind": "human_result",
                "expectedSequence": 4,
            }
            replayed_tool_response = await client.post(
                tool_response_url,
                headers=tool_response_headers,
                json=tool_response_payload,
            )
            assert replayed_tool_response.status_code == 200, replayed_tool_response.text
            assert replayed_tool_response.json()["data"] == tool_response.json()["data"]
            persisted_response = await AgentToolResponseV1Record.get(response_id=tool_response_id)
            assert persisted_response.run_id == human_run_id
            assert persisted_response.expected_sequence == 4

            current_user = viewer
            denied_create = await client.post(
                base_url,
                headers={"Idempotency-Key": "viewer-thread-create"},
                json=payload,
            )
            assert denied_create.status_code == 403, denied_create.text
            assert denied_create.json()["error"] == "PERMISSION_DENIED"
            denied_run = await client.post(
                run_create_url,
                headers={"Idempotency-Key": "viewer-run-create"},
                json=run_payload,
            )
            assert denied_run.status_code == 403, denied_run.text
            assert denied_run.json()["error"] == "PERMISSION_DENIED"
            denied_cancel = await client.post(cancel_url)
            assert denied_cancel.status_code == 403, denied_cancel.text
            assert denied_cancel.json()["error"] == "PERMISSION_DENIED"
            denied_tool_response = await client.post(
                tool_response_url,
                headers={"Idempotency-Key": "viewer-tool-response"},
                json=tool_response_payload,
            )
            assert denied_tool_response.status_code == 403, denied_tool_response.text
            assert denied_tool_response.json()["error"] == "PERMISSION_DENIED"

            hidden_owner_thread = await client.get(f"{base_url}/{thread_id}")
            assert hidden_owner_thread.status_code == 404, hidden_owner_thread.text
            assert hidden_owner_thread.json()["error"] == "AGENT_THREAD_NOT_FOUND"
            hidden_owner_run = await client.get(run_url)
            assert hidden_owner_run.status_code == 404, hidden_owner_run.text
            assert hidden_owner_run.json()["error"] == "AGENT_RUN_NOT_FOUND"

            current_user = owner
            deleted = await client.delete(f"{base_url}/{thread_id}")
            assert deleted.status_code == 200, deleted.text
            assert deleted.json()["data"]["threadId"] == thread_id
            missing = await client.get(f"{base_url}/{thread_id}")
            assert missing.status_code == 404, missing.text
            assert missing.json()["error"] == "AGENT_THREAD_NOT_FOUND"
