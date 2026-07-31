from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.core.events import Event
from src.core.exceptions import Conflict, NotFound
from src.models.agents.runtime_design_system_v1 import AgentRunDesignSystemSnapshotV1Record
from src.models.agents.runtime_v1 import (
    AgentRunEventV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
)
from src.models.jobs.background_job import BackgroundJobRecord, JobDispatchOutboxRecord
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_manifest import official_agent_id
from src.modules.ai.runtime_job_schema import AgentRunJobInput
from src.modules.ai.runtime_run_schema import AgentRunCreateRequestV1
from src.modules.ai.runtime_run_service import AgentRunService
from src.modules.ai.runtime_thread_schema import AgentThreadCreateRequestV1
from src.modules.ai.runtime_thread_service import AgentThreadService
from src.modules.jobs.service import BackgroundJobService
from tests.modules.ai.runtime_design_system_test_context import fixed_design_system_context_resolver

pytestmark = pytest.mark.integration

_COORDINATOR_AGENT_ID = official_agent_id("arclayer-coordinator")
_DATA_ANALYST_AGENT_ID = official_agent_id("data-analyst")


class _RecordingEventPublisher:
    def __init__(self) -> None:
        self.events: list[Event] = []

    async def publish(self, event: Event) -> None:
        self.events.append(event)


async def _scope() -> tuple[Workspace, ProjectRecord, UUID]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"agent-run-create-org-{uuid4().hex[:10]}",
        name="Agent Run Create Org",
        owner_user_id=owner_user_id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Agent Run Create Workspace",
        is_active=True,
        owner_user_id=owner_user_id,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"agent-run-create-project-{uuid4().hex[:10]}",
        name="Agent Run Create Project",
        is_active=True,
        created_by_user_id=owner_user_id,
    )
    return workspace, project, owner_user_id


@pytest.mark.asyncio
async def test_run_create_atomically_persists_job_message_and_queued_event(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    thread = await AgentThreadService(event_publisher=_RecordingEventPublisher()).create(
        workspace_id=workspace.id,
        owner_user_id=owner_user_id,
        idempotency_key="run-create-thread",
        payload=AgentThreadCreateRequestV1(
            project_id=project.id,
            lead_agent_id=_COORDINATOR_AGENT_ID,
            title="Build the launch site",
        ),
    )
    publisher = _RecordingEventPublisher()
    service = AgentRunService(
        job_service=BackgroundJobService(event_publisher=publisher),
        event_publisher=publisher,
        design_system_context_resolver=fixed_design_system_context_resolver(project.id),
    )
    payload = AgentRunCreateRequestV1(
        project_id=project.id,
        lead_agent_id=_COORDINATOR_AGENT_ID,
        mentioned_agent_ids=(_DATA_ANALYST_AGENT_ID,),
        execution_mode="build",
        message="Create a launch-ready homepage.",
    )

    created = await service.create(
        workspace_id=workspace.id,
        thread_id=thread.thread_id,
        owner_user_id=owner_user_id,
        idempotency_key="run-create-1",
        payload=payload,
    )
    replayed = await service.create(
        workspace_id=workspace.id,
        thread_id=thread.thread_id,
        owner_user_id=owner_user_id,
        idempotency_key="run-create-1",
        payload=payload,
    )

    assert replayed == created
    assert created.status == AgentRunStatusV1.QUEUED
    assert created.last_sequence == 2
    run = await AgentRunV1Record.get(id=created.run_id)
    job = await BackgroundJobRecord.get(id=run.job_id)
    assert job.job_type == "agent.run.execute"
    assert job.actor_user_id == owner_user_id
    assert job.workspace_id == workspace.id
    assert job.project_id is None
    job_input = AgentRunJobInput.model_validate(job.input_reference)
    assert job_input.run_id == created.run_id
    assert job_input.project_id == project.id
    assert await BackgroundJobRecord.filter(id=job.id).count() == 1
    assert await JobDispatchOutboxRecord.filter(job_id=job.id).count() == 1
    assert await AgentRunV1Record.filter(id=created.run_id).count() == 1
    context = await AgentRunDesignSystemSnapshotV1Record.get(run_id=created.run_id)
    assert context.project_id == project.id
    assert context.assignment_revision == 1
    events = await AgentRunEventV1Record.filter(run_id=created.run_id).order_by("sequence")
    assert [event.type for event in events] == ["run.created", "run.queued"]
    assert [event.sequence for event in events] == [1, 2]
    assert [event.name for event in publisher.events] == ["job.created"]

    with pytest.raises(Conflict) as conflict:
        await service.create(
            workspace_id=workspace.id,
            thread_id=thread.thread_id,
            owner_user_id=owner_user_id,
            idempotency_key="run-create-1",
            payload=payload.model_copy(update={"message": "Different request"}),
        )
    assert conflict.value.error == "AGENT_RUN_IDEMPOTENCY_CONFLICT"


@pytest.mark.asyncio
async def test_run_create_rolls_back_job_when_thread_scope_is_invalid(prepared_db) -> None:
    _ = prepared_db
    workspace, project, owner_user_id = await _scope()
    service = AgentRunService(
        job_service=BackgroundJobService(event_publisher=_RecordingEventPublisher()),
        event_publisher=_RecordingEventPublisher(),
    )
    before_jobs = await BackgroundJobRecord.all().count()

    with pytest.raises(NotFound) as error:
        await service.create(
            workspace_id=workspace.id,
            thread_id=uuid4(),
            owner_user_id=owner_user_id,
            idempotency_key="missing-thread",
            payload=AgentRunCreateRequestV1(
                project_id=project.id,
                lead_agent_id=_COORDINATOR_AGENT_ID,
                execution_mode="build",
                message="This must not create an orphan Job.",
            ),
        )

    assert error.value.error == "AGENT_THREAD_NOT_FOUND"
    assert await BackgroundJobRecord.all().count() == before_jobs
