from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.core.events import Event
from src.core.exceptions import Conflict, NotFound
from src.core.http.pagination import PageParams
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAuthorityMode,
    JobInternalStatus,
    JobRetryClass,
    JobWorkloadClass,
)
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.jobs.registry import (
    JobPermissionRequirement,
    JobPermissionScope,
    JobTargetScope,
    JobTypeDefinition,
    JobTypeRegistry,
    JobVisibility,
)
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.retry import JobRetryPolicy
from src.modules.jobs.workspace_schema import (
    JobPublicStatus,
    WorkspaceJobCancelRequest,
    WorkspaceJobListQuery,
)
from src.modules.jobs.workspace_service import WorkspaceJobService
from src.modules.projects.repository import ProjectRepository
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext

NOW = datetime(2026, 7, 15, 18, tzinfo=UTC)


class FakeEventPublisher:
    def __init__(self) -> None:
        self.events: list[Event] = []

    async def publish(self, event: Event) -> None:
        self.events.append(event)


class FakeProjectRepository:
    def __init__(self, project_ids: list[UUID]) -> None:
        self.project_ids = project_ids

    async def list_accessible_project_ids(self, *, workspace_id: UUID, user_id: UUID) -> list[UUID]:
        _ = workspace_id, user_id
        return self.project_ids


class FakeWorkspaceJobRepository:
    def __init__(self, jobs: list[BackgroundJobRecord]) -> None:
        self.jobs = jobs
        self.last_list: dict[str, Any] | None = None
        self.database_time = NOW

    async def list_workspace_jobs(self, **kwargs):
        self.last_list = kwargs
        params = kwargs["params"]
        return self.jobs[params.offset : params.offset + params.limit], len(self.jobs)

    async def get_visible_workspace_job(self, **kwargs):
        workspace_id = kwargs["workspace_id"]
        job_id = kwargs["job_id"]
        return next(
            (job for job in self.jobs if job.id == job_id and job.workspace_id == workspace_id),
            None,
        )

    async def update_job_fields(self, *, job, fields: dict[str, object], conn) -> None:
        _ = conn
        for name, value in fields.items():
            setattr(job, name, value)

    async def get_database_time(self, *, conn) -> datetime:
        _ = conn
        return self.database_time


class FakeTransactionWorkspaceJobService(WorkspaceJobService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[object]:
        yield conn or object()


def create_definition(
    *,
    job_type: str = "asset.thumbnail.generate",
    visibility: JobVisibility = JobVisibility.PROJECT,
    target_scope: JobTargetScope = JobTargetScope.PROJECT,
    task_suffix: str = "asset-thumbnail",
    cancellable_phases: frozenset[str] = frozenset({"queued", "generating"}),
) -> JobTypeDefinition:
    permission = JobPermissionRequirement(
        scope=JobPermissionScope.WORKSPACE,
        action="system:assets:manage",
    )
    return JobTypeDefinition(
        job_type=job_type,
        job_type_version=1,
        task_name=f"jobs:asset-cpu:{task_suffix}:v1",
        workload_class=JobWorkloadClass.ASSET_CPU,
        target_scope=target_scope,
        visibility=visibility,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=permission,
        manage_permission=permission,
        initial_phase="queued",
        phases=frozenset({"queued", "generating"}),
        cancellable_phases=cancellable_phases,
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=3,
            initial_delay_seconds=5,
            multiplier=2,
            maximum_delay_seconds=60,
            retryable_codes=frozenset({
                "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
                "BACKGROUND_JOB_WORKER_LOST",
            }),
        ),
        timeout_seconds=120,
        lease_seconds=90,
        heartbeat_seconds=30,
        idempotency_namespace=task_suffix,
    )


def create_job(
    *,
    workspace_id: UUID,
    project_id: UUID,
    actor_user_id: UUID,
    internal_status: JobInternalStatus = JobInternalStatus.QUEUED,
    phase: str = "queued",
) -> BackgroundJobRecord:
    return BackgroundJobRecord(
        id=uuid4(),
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        task_name="jobs:asset-cpu:asset-thumbnail:v1",
        workload_class=JobWorkloadClass.ASSET_CPU,
        internal_status=internal_status,
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=3,
            initial_delay_seconds=5,
            multiplier=2,
            maximum_delay_seconds=60,
            retryable_codes=frozenset({"ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE"}),
        ).model_dump(mode="json", by_alias=True),
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        target_descriptor={"assetId": str(uuid4())},
        idempotency_scope_key=str(workspace_id),
        idempotency_key_hash="a" * 64,
        request_fingerprint="b" * 64,
        correlation_id="workspace-job-test",
        phase=phase,
        result_reference={"assetId": str(uuid4())},
        created_at=NOW,
        updated_at=NOW,
    )


def create_context(workspace_id: UUID) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        workspace_kind=WorkspaceKind.TEAM,
        access_type=WorkspaceAccessType.MEMBER,
        workspace_membership_id=uuid4(),
    )


def create_service(
    *,
    jobs: list[BackgroundJobRecord],
    definitions: list[JobTypeDefinition] | None = None,
    accessible_project_ids: list[UUID] | None = None,
) -> tuple[FakeTransactionWorkspaceJobService, FakeWorkspaceJobRepository, FakeEventPublisher]:
    repository = FakeWorkspaceJobRepository(jobs)
    publisher = FakeEventPublisher()
    service = FakeTransactionWorkspaceJobService(
        Settings(app_env="test", database={"enabled": False}),
        repository=cast(BackgroundJobRepository, repository),
        project_repository=cast(ProjectRepository, FakeProjectRepository(accessible_project_ids or [])),
        registry=JobTypeRegistry(definitions or [create_definition()], strict_contracts=False),
        event_publisher=publisher,
    )
    return service, repository, publisher


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("internal_status", "public_status"),
    [
        (JobInternalStatus.PENDING_DISPATCH, "queued"),
        (JobInternalStatus.QUEUED, "queued"),
        (JobInternalStatus.RETRY_SCHEDULED, "queued"),
        (JobInternalStatus.RUNNING, "running"),
        (JobInternalStatus.WAITING_FOR_USER, "waiting_for_user"),
        (JobInternalStatus.SUCCEEDED, "succeeded"),
        (JobInternalStatus.FAILED, "failed"),
        (JobInternalStatus.DEAD_LETTERED, "failed"),
        (JobInternalStatus.CANCELLED, "cancelled"),
    ],
)
async def test_get_job_projects_every_internal_status_safely(
    internal_status: JobInternalStatus,
    public_status: str,
) -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    job = create_job(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=user_id,
        internal_status=internal_status,
    )
    service, _, _ = create_service(jobs=[job], accessible_project_ids=[project_id])

    result = await service.get_job(workspace_id=workspace_id, job_id=job.id, actor_user_id=user_id)
    serialized = result.model_dump(mode="json", by_alias=True)

    assert result.status == public_status
    assert result.has_result is True
    assert "taskName" not in serialized
    assert "targetDescriptor" not in serialized
    assert "inputReference" not in serialized
    assert "traceId" not in serialized
    assert "errorMetadata" not in serialized


@pytest.mark.asyncio
async def test_list_jobs_passes_registry_visibility_and_project_access_before_pagination() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    job = create_job(workspace_id=workspace_id, project_id=project_id, actor_user_id=user_id)
    definitions = [
        create_definition(),
        create_definition(
            job_type="workspace.export",
            visibility=JobVisibility.WORKSPACE,
            target_scope=JobTargetScope.WORKSPACE,
            task_suffix="workspace-export",
        ),
        create_definition(
            job_type="owner.report",
            visibility=JobVisibility.OWNER_ONLY,
            target_scope=JobTargetScope.WORKSPACE,
            task_suffix="owner-report",
        ),
        create_definition(
            job_type="system.cleanup",
            visibility=JobVisibility.SYSTEM,
            target_scope=JobTargetScope.SYSTEM,
            task_suffix="system-cleanup",
        ).model_copy(
            update={
                "authority_mode": JobAuthorityMode.SYSTEM_SERVICE,
                "required_permission": None,
            }
        ),
    ]
    service, repository, _ = create_service(
        jobs=[job],
        definitions=definitions,
        accessible_project_ids=[project_id],
    )

    page = await service.list_jobs(
        workspace_id=workspace_id,
        actor_user_id=user_id,
        params=PageParams(page=1, size=20),
        filters=WorkspaceJobListQuery(status=JobPublicStatus.QUEUED),
    )

    assert page.total == 1
    assert repository.last_list is not None
    assert repository.last_list["accessible_project_ids"] == [project_id]
    assert len(repository.last_list["project_definitions"]) == 1
    assert len(repository.last_list["workspace_definitions"]) == 1
    assert len(repository.last_list["owner_definitions"]) == 1
    assert repository.last_list["internal_statuses"] == (
        JobInternalStatus.PENDING_DISPATCH,
        JobInternalStatus.QUEUED,
        JobInternalStatus.RETRY_SCHEDULED,
    )


@pytest.mark.asyncio
async def test_get_job_hides_foreign_workspace_identifier() -> None:
    workspace_id = uuid4()
    job = create_job(workspace_id=uuid4(), project_id=uuid4(), actor_user_id=uuid4())
    service, _, _ = create_service(jobs=[job])

    with pytest.raises(NotFound) as exc_info:
        await service.get_job(workspace_id=workspace_id, job_id=job.id, actor_user_id=uuid4())

    assert exc_info.value.error == "BACKGROUND_JOB_NOT_FOUND"


@pytest.mark.asyncio
async def test_creator_cancellation_records_request_without_claiming_cancelled() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    job = create_job(workspace_id=workspace_id, project_id=project_id, actor_user_id=user_id)
    service, repository, publisher = create_service(jobs=[job], accessible_project_ids=[project_id])
    database_now = NOW + datetime.resolution
    repository.database_time = database_now

    result = await service.request_cancellation(
        ctx=create_context(workspace_id),
        job_id=job.id,
        actor_user_id=user_id,
        payload=WorkspaceJobCancelRequest(reason="No longer needed"),
    )

    assert result.status == "queued"
    assert result.cancel_requested_at == database_now
    assert job.cancel_reason == "No longer needed"
    assert [event.name for event in publisher.events] == ["job.cancellation_requested"]


@pytest.mark.asyncio
async def test_cancellation_rejects_non_cancellable_phase_without_mutation() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    job = create_job(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=user_id,
        phase="provider-commit",
    )
    service, _, publisher = create_service(jobs=[job], accessible_project_ids=[project_id])

    with pytest.raises(Conflict) as exc_info:
        await service.request_cancellation(
            ctx=create_context(workspace_id),
            job_id=job.id,
            actor_user_id=user_id,
            payload=WorkspaceJobCancelRequest(),
        )

    assert exc_info.value.error == "BACKGROUND_JOB_NOT_CANCELLABLE"
    assert job.cancel_requested_at is None
    assert publisher.events == []


@pytest.mark.asyncio
async def test_repeated_cancellation_preserves_first_request_evidence() -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    job = create_job(workspace_id=workspace_id, project_id=project_id, actor_user_id=user_id)
    service, _, publisher = create_service(jobs=[job], accessible_project_ids=[project_id])
    ctx = create_context(workspace_id)

    await service.request_cancellation(
        ctx=ctx,
        job_id=job.id,
        actor_user_id=user_id,
        payload=WorkspaceJobCancelRequest(reason="First reason"),
    )
    await service.request_cancellation(
        ctx=ctx,
        job_id=job.id,
        actor_user_id=user_id,
        payload=WorkspaceJobCancelRequest(reason="Replacement reason"),
    )

    assert job.cancel_requested_at == NOW
    assert job.cancel_reason == "First reason"
    assert len(publisher.events) == 1
