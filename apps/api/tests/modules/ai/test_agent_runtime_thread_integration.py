from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from src.core.events import Event
from src.core.exceptions import Conflict, NotFound
from src.models.agents.runtime_v1 import AgentThreadV1Record
from src.models.organization.organization import Organization, OrganizationKind
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_manifest import official_agent_id
from src.modules.ai.runtime_protocol_schema import RunCreatedEventV1
from src.modules.ai.runtime_repository import AgentRuntimeRepository
from src.modules.ai.runtime_repository_schema import AgentRunCreatePersistenceCommand
from src.modules.ai.runtime_thread_schema import AgentThreadCreateRequestV1, AgentThreadUpdateRequestV1
from src.modules.ai.runtime_thread_service import AgentThreadService

pytestmark = pytest.mark.integration

_LEAD_AGENT_ID = official_agent_id("arclayer-coordinator")


class _RecordingEventPublisher:
    def __init__(self) -> None:
        self.events: list[Event] = []

    async def publish(self, event: Event) -> None:
        self.events.append(event)


async def _scope() -> tuple[Workspace, ProjectRecord, UUID]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-thread-org-{uuid4().hex[:10]}",
        name="Agent Thread Org",
        kind=OrganizationKind.TEAM,
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Thread Workspace",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-thread-project-{uuid4().hex[:10]}",
        name="Agent Thread Project",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    return workspace, project, owner_user_id


def _thread_request(*, project_id: UUID | None, title: str) -> AgentThreadCreateRequestV1:
    return AgentThreadCreateRequestV1(
        project_id=project_id,
        lead_agent_id=_LEAD_AGENT_ID,
        title=title,
    )


@pytest.mark.asyncio
async def test_thread_create_is_exactly_idempotent_and_rejects_reused_command(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    publisher = _RecordingEventPublisher()
    service = AgentThreadService(event_publisher=publisher)
    payload = _thread_request(project_id=project.id, title="Homepage collaboration")

    created = await service.create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="thread-create-homepage",
        payload=payload,
    )
    replayed = await service.create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="thread-create-homepage",
        payload=payload,
    )

    assert replayed == created
    assert created.project_id == project.id
    assert await AgentThreadV1Record.filter(id=created.thread_id).count() == 1
    assert [event.name for event in publisher.events] == ["agent.thread.created"]

    with pytest.raises(Conflict) as conflict:
        await service.create(
            workspace_id=workspace.id,
            owner_user_id=owner_user_id,
            idempotency_key="thread-create-homepage",
            payload=payload.model_copy(update={"title": "Different command"}),
        )
    assert conflict.value.error == "AGENT_THREAD_IDEMPOTENCY_CONFLICT"


@pytest.mark.asyncio
async def test_thread_list_uses_owned_project_filter_and_stable_cursor(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    service = AgentThreadService(event_publisher=_RecordingEventPublisher())
    created_ids: list[UUID] = []
    for command_key, project_id, title in (
        ("thread-list-alpha", project.id, "Alpha homepage"),
        ("thread-list-beta", project.id, "Beta homepage"),
        ("thread-list-workspace", None, "Workspace research"),
    ):
        created = await service.create(
            workspace_id=workspace.id,
            owner_user_id=owner_user_id,
            idempotency_key=command_key,
            payload=_thread_request(project_id=project_id, title=title),
        )
        created_ids.append(created.thread_id)

    page_one = await service.list(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        project_id=project.id,
        archived=False,
        query="homepage",
        cursor=None,
        limit=1,
    )
    assert len(page_one.items) == 1
    assert page_one.next_cursor == page_one.items[0].thread_id

    page_two = await service.list(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        project_id=project.id,
        archived=False,
        query="homepage",
        cursor=page_one.next_cursor,
        limit=1,
    )
    assert len(page_two.items) == 1
    assert page_two.items[0].thread_id != page_one.items[0].thread_id
    assert page_two.next_cursor is None

    global_threads = await service.list(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        project_id=None,
        archived=False,
        query=None,
        cursor=None,
        limit=25,
    )
    assert {item.thread_id for item in global_threads.items} == set(created_ids)


@pytest.mark.asyncio
async def test_thread_history_archive_and_soft_delete_preserve_normalized_rows(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    service = AgentThreadService(event_publisher=_RecordingEventPublisher())
    created_thread = await service.create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="thread-history-homepage",
        payload=_thread_request(project_id=project.id, title="Homepage collaboration"),
    )
    thread_id = created_thread.thread_id
    run_id = uuid4()
    occurred_at = datetime(2026, 7, 19, 12, 0, tzinfo=UTC)
    event = RunCreatedEventV1.model_validate({
        "eventVersion": 1,
        "eventId": "thread-history-created",
        "cursor": "thread-history-cursor",
        "type": "run.created",
        "runId": str(run_id),
        "threadId": str(thread_id),
        "sequence": 1,
        "occurredAt": occurred_at,
        "correlationId": "thread-history-correlation",
        "spanId": None,
        "parentSpanId": None,
        "data": {
            "run": {
                "status": "created",
                "executionMode": "plan",
                "leadAgentId": str(_LEAD_AGENT_ID),
                "createdAt": occurred_at,
            }
        },
    })
    await AgentRuntimeRepository().create_run_with_first_event(
        command=AgentRunCreatePersistenceCommand(
            run_id=run_id,
            workspace_id=workspace.id,
            project_id=project.id,
            thread_id=thread_id,
            owner_user_id=owner_user_id,
            lead_agent_id=_LEAD_AGENT_ID,
            lead_agent_version_id=created_thread.lead_agent_version_id,
            lead_agent_assignment_id=created_thread.lead_agent_assignment_id,
            execution_mode="plan",
            site_revision_id=None,
            message="Plan a clearer homepage.",
            idempotency_key="thread-history-command",
            correlation_id="thread-history-correlation",
        ),
        event=event,
    )

    detail = await service.get(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        thread_id=thread_id,
    )
    assert [(message.role, message.actor_user_id, message.parts[0].text) for message in detail.messages] == [
        ("user", owner_user_id, "Plan a clearer homepage.")
    ]
    assert detail.active_run_id == run_id

    archived = await service.update(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        thread_id=thread_id,
        payload=AgentThreadUpdateRequestV1(archived=True),
    )
    assert archived.archived_at is not None
    archived_list = await service.list(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        project_id=project.id,
        archived=True,
        query=None,
        cursor=None,
        limit=25,
    )
    assert [item.thread_id for item in archived_list.items] == [thread_id]

    deleted = await service.delete(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        thread_id=thread_id,
    )
    assert deleted.thread_id == thread_id
    assert await AgentThreadV1Record.filter(id=thread_id, deleted_at__not_isnull=True).exists()
    with pytest.raises(NotFound) as not_found:
        await service.get(
            workspace_id=workspace.id,
            owner_user_id=owner_user_id,
            thread_id=thread_id,
        )
    assert not_found.value.error == "AGENT_THREAD_NOT_FOUND"


@pytest.mark.asyncio
async def test_thread_owner_and_project_scope_do_not_leak_metadata(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    other_workspace, other_project, other_user_id = await _scope()
    service = AgentThreadService(event_publisher=_RecordingEventPublisher())
    created = await service.create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="private-thread",
        payload=_thread_request(project_id=project.id, title="Private thread"),
    )
    thread_id = created.thread_id

    with pytest.raises(NotFound) as cross_owner:
        await service.get(
            workspace_id=workspace.id,
            owner_user_id=other_user_id,
            thread_id=thread_id,
        )
    assert cross_owner.value.error == "AGENT_THREAD_NOT_FOUND"

    with pytest.raises(NotFound) as foreign_project:
        await service.create(
            workspace_id=other_workspace.id,
            owner_user_id=other_user_id,
            idempotency_key="foreign-project-thread",
            payload=_thread_request(
                project_id=project.id,
                title="Cross-workspace project",
            ),
        )
    assert foreign_project.value.error == "AGENT_PROJECT_NOT_FOUND"
    assert other_project.workspace_id == other_workspace.id
