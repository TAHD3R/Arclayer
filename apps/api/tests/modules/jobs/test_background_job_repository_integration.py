from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID, uuid4

import pytest
from pydantic import ConfigDict
from tortoise import connections
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.config import get_settings
from src.core.events import Event
from src.core.exceptions import NotFound
from src.core.http.pagination import PageParams
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobDispatchOutboxRecord,
    JobRetryClass,
    JobWorkloadClass,
)
from src.models.organization.organization import Organization, OrganizationKind
from src.models.organization.user import User
from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership
from src.modules.jobs.registry import (
    JobAuthorityMode,
    JobPermissionRequirement,
    JobPermissionScope,
    JobTargetScope,
    JobTypeDefinition,
    JobTypeRegistry,
    JobVisibility,
)
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.retry import JobRetryPolicy
from src.modules.jobs.schema import BackgroundJobCreate, JobDispatchEnvelope
from src.modules.jobs.service import BackgroundJobService
from src.modules.jobs.workspace_schema import WorkspaceJobCancelRequest, WorkspaceJobListQuery
from src.modules.jobs.workspace_service import WorkspaceJobService
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext

pytestmark = pytest.mark.integration

NOW = datetime(2026, 7, 15, 12, tzinfo=UTC)
LOCK_PROBE_TIMEOUT_SECONDS = 5.0
ATTEMPT_NUMBER_CONSTRAINT = "uid_background__job_id_1ed2d9"
FENCING_TOKEN_CONSTRAINT = "background_job_attempts_fencing_token_key"
JOB_TABLES = {
    "background_jobs",
    "background_job_attempts",
    "background_job_dispatch_outbox",
}


class SystemJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)


class WorkspaceJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID


class ProjectJobTarget(WorkspaceJobTarget):
    project_id: PublicUUID


class RuntimeJobTarget(ProjectJobTarget):
    site_id: PublicUUID


class IntegrationJobInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    request_id: str


class IntegrationJobResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: PublicUUID


class RecordingEventPublisher:
    def __init__(self) -> None:
        self.events: list[Event] = []

    async def publish(self, event: Event) -> None:
        self.events.append(event)


@dataclass(frozen=True)
class WorkspaceGraph:
    user: User
    organization: Organization
    workspace: Workspace
    workspace_membership: WorkspaceMembership
    accessible_project: ProjectRecord
    hidden_project: ProjectRecord
    foreign_workspace: Workspace
    foreign_workspace_membership: WorkspaceMembership


class RollbackProbe(RuntimeError):
    pass


class CoordinatedIdempotencyRepository(BackgroundJobRepository):
    def __init__(self, *, participant_count: int) -> None:
        super().__init__()
        self._participant_count = participant_count
        self._preflight_lock = asyncio.Lock()
        self._all_preflights_complete = asyncio.Event()
        self.preflight_reads = 0
        self.recovered_conflicts = 0

    async def get_by_idempotency_hash(
        self,
        *,
        idempotency_key_hash: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> BackgroundJobRecord | None:
        result = await super().get_by_idempotency_hash(
            idempotency_key_hash=idempotency_key_hash,
            conn=conn,
        )
        if result is not None:
            self.recovered_conflicts += 1
            return result

        async with self._preflight_lock:
            self.preflight_reads += 1
            if self.preflight_reads == self._participant_count:
                self._all_preflights_complete.set()
        await self._all_preflights_complete.wait()
        return None


class DispatchFailureRepository(BackgroundJobRepository):
    async def create_dispatch(
        self,
        *,
        job: BackgroundJobRecord,
        dispatch_sequence: int,
        task_name: str,
        envelope: JobDispatchEnvelope,
        envelope_hash: str,
        available_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord:
        await super().create_dispatch(
            job=job,
            dispatch_sequence=dispatch_sequence,
            task_name=task_name,
            envelope=envelope,
            envelope_hash=envelope_hash,
            available_at=available_at,
            conn=conn,
        )
        raise RollbackProbe


class ScopedCancellationLockProbeRepository(BackgroundJobRepository):
    def __init__(self, *, target_workspace_id: UUID) -> None:
        super().__init__()
        self._target_workspace_id = target_workspace_id
        self._target_call_count = 0
        self.first_lock_acquired = asyncio.Event()
        self.release_first_lock = asyncio.Event()
        self.second_select_started = asyncio.Event()
        self.second_select_completed = asyncio.Event()
        self.first_backend_pid: int | None = None
        self.second_backend_pid: int | None = None

    async def get_visible_workspace_job(
        self,
        *,
        workspace_id: UUID,
        job_id: UUID,
        actor_user_id: UUID,
        accessible_project_ids: Sequence[UUID],
        workspace_definitions: Sequence[JobTypeDefinition],
        project_definitions: Sequence[JobTypeDefinition],
        owner_definitions: Sequence[JobTypeDefinition],
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> BackgroundJobRecord | None:
        if workspace_id != self._target_workspace_id or not for_update:
            return await super().get_visible_workspace_job(
                workspace_id=workspace_id,
                job_id=job_id,
                actor_user_id=actor_user_id,
                accessible_project_ids=accessible_project_ids,
                workspace_definitions=workspace_definitions,
                project_definitions=project_definitions,
                owner_definitions=owner_definitions,
                conn=conn,
                for_update=for_update,
            )
        if conn is None:
            raise AssertionError("Cancellation lock probe requires an active transaction")

        self._target_call_count += 1
        call_number = self._target_call_count
        backend_pid = await _backend_pid(conn)
        if call_number == 1:
            self.first_backend_pid = backend_pid
        elif call_number == 2:
            self.second_backend_pid = backend_pid
            self.second_select_started.set()

        result = await super().get_visible_workspace_job(
            workspace_id=workspace_id,
            job_id=job_id,
            actor_user_id=actor_user_id,
            accessible_project_ids=accessible_project_ids,
            workspace_definitions=workspace_definitions,
            project_definitions=project_definitions,
            owner_definitions=owner_definitions,
            conn=conn,
            for_update=for_update,
        )
        if call_number == 1:
            self.first_lock_acquired.set()
            await self.release_first_lock.wait()
        elif call_number == 2:
            self.second_select_completed.set()
        return result


async def _backend_pid(conn: BaseDBAsyncClient) -> int:
    rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
    return int(rows[0]["pid"])


async def _wait_for_blocking_pid(
    *,
    blocked_pid: int,
    blocker_pid: int,
    select_completed: asyncio.Event,
) -> None:
    while not select_completed.is_set():
        rows = await connections.get("default").execute_query_dict(
            "SELECT pg_blocking_pids($1::int) AS blocker_pids",
            [blocked_pid],
        )
        blocking_pids = {int(value) for value in rows[0]["blocker_pids"]}
        if blocker_pid in blocking_pids:
            return
        await asyncio.sleep(0)
    raise AssertionError("Second cancellation SELECT completed without waiting for the first row lock")


def _postgres_constraint_name(exc: IntegrityError) -> str:
    wrapped_error = exc.args[0] if exc.args else None
    constraint_name = getattr(wrapped_error, "constraint_name", None)
    if not isinstance(constraint_name, str):
        raise AssertionError("PostgreSQL constraint_name was not available on IntegrityError")
    return constraint_name


def _definition(
    job_type: str,
    *,
    target_scope: JobTargetScope,
    visibility: JobVisibility,
    cancellable: bool = False,
) -> JobTypeDefinition:
    manage_permission = (
        JobPermissionRequirement(
            scope=JobPermissionScope.WORKSPACE,
            action="system:jobs:manage",
        )
        if cancellable
        else None
    )
    task_slug = job_type.replace(".", "-")
    target_schema_by_scope: dict[JobTargetScope, type[BaseSchema]] = {
        JobTargetScope.SYSTEM: SystemJobTarget,
        JobTargetScope.WORKSPACE: WorkspaceJobTarget,
        JobTargetScope.PROJECT: ProjectJobTarget,
        JobTargetScope.RUNTIME: RuntimeJobTarget,
    }
    return JobTypeDefinition(
        job_type=job_type,
        job_type_version=1,
        task_name=f"jobs:maintenance:{task_slug}:v1",
        workload_class=JobWorkloadClass.MAINTENANCE,
        target_scope=target_scope,
        visibility=visibility,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        manage_permission=manage_permission,
        initial_phase="queued",
        initial_status_key="jobs.status.queued",
        phases=frozenset({"queued"}),
        cancellable_phases=frozenset({"queued"}) if cancellable else frozenset(),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=3,
            initial_delay_seconds=5,
            multiplier=2,
            maximum_delay_seconds=60,
            retryable_codes=frozenset({"BACKGROUND_JOB_WORKER_LOST"}),
        ),
        timeout_seconds=120,
        lease_seconds=90,
        heartbeat_seconds=30,
        idempotency_namespace=task_slug,
        target_schema=target_schema_by_scope[target_scope],
        input_reference_schema=IntegrationJobInput,
        result_reference_schema=IntegrationJobResult,
    )


def _job_command(
    definition: JobTypeDefinition,
    *,
    workspace_id: UUID,
    idempotency_key: str,
    correlation_id: str,
) -> BackgroundJobCreate:
    target = WorkspaceJobTarget(workspace_id=workspace_id)
    input_reference = IntegrationJobInput(request_id=correlation_id)
    return BackgroundJobCreate(
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        authority_mode=definition.authority_mode,
        workspace_id=workspace_id,
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        idempotency_key=idempotency_key,
        correlation_id=correlation_id,
        retry_class=definition.retry_class,
        max_attempts=definition.max_attempts,
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
    )


async def _create_job(
    definition: JobTypeDefinition,
    *,
    workspace_id: UUID | None,
    project_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    conn: BaseDBAsyncClient | None = None,
) -> BackgroundJobRecord:
    token = uuid4().hex
    target_descriptor = {
        key: str(value)
        for key, value in {
            "workspaceId": workspace_id,
            "projectId": project_id,
        }.items()
        if value is not None
    }
    return await BackgroundJobRecord.create(
        using_db=conn,
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        retry_class=definition.retry_class,
        authority_mode=definition.authority_mode,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        target_descriptor=target_descriptor,
        idempotency_scope_key=f"{workspace_id or 'global'}:{project_id or 'none'}:none",
        idempotency_key_hash=sha256(f"idempotency:{token}".encode()).hexdigest(),
        request_fingerprint=sha256(f"request:{token}".encode()).hexdigest(),
        correlation_id=f"jobs-integration-{token}",
        retry_policy=definition.retry_policy.model_dump(mode="json", by_alias=True),
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
        phase=definition.initial_phase,
        status_key=definition.initial_status_key,
    )


async def _create_dispatch(
    job: BackgroundJobRecord,
    *,
    conn: BaseDBAsyncClient | None = None,
) -> JobDispatchOutboxRecord:
    envelope = {
        "jobId": str(job.id),
        "dispatchSequence": 1,
        "jobType": job.job_type,
        "jobTypeVersion": job.job_type_version,
        "workloadClass": str(job.workload_class),
        "messageSchemaVersion": 1,
        "targetDescriptor": job.target_descriptor,
        "requestFingerprint": job.request_fingerprint,
    }
    return await JobDispatchOutboxRecord.create(
        using_db=conn,
        job_id=job.id,
        dispatch_sequence=1,
        task_name=job.task_name,
        message_schema_version=1,
        envelope=envelope,
        envelope_hash=sha256(repr(envelope).encode()).hexdigest(),
        workload_class=job.workload_class,
        available_at=NOW,
    )


async def _create_workspace_graph() -> WorkspaceGraph:
    token = uuid4().hex
    user = await User.create(username=f"jobs-user-{token}")
    organization = await Organization.create(
        slug=f"jobs-org-{token}",
        name="Background Jobs Integration",
        kind=OrganizationKind.TEAM,
        owner_user_id=user.id,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Jobs Workspace",
        owner_user_id=user.id,
        is_active=True,
        created_by_user_id=user.id,
    )
    foreign_workspace = await Workspace.create(
        organization_id=organization.id,
        name="Foreign Jobs Workspace",
        owner_user_id=user.id,
        is_active=True,
        created_by_user_id=user.id,
    )
    workspace_membership = await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=user.id,
    )
    foreign_workspace_membership = await WorkspaceMembership.create(
        workspace_id=foreign_workspace.id,
        user_id=user.id,
    )
    accessible_project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"accessible-{token[:12]}",
        name="Accessible Project",
        is_active=True,
        created_by_user_id=user.id,
    )
    hidden_project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"hidden-{token[:12]}",
        name="Hidden Project",
        is_active=True,
        created_by_user_id=user.id,
    )
    await ProjectMembership.create(
        project_id=accessible_project.id,
        user_id=user.id,
        role=ProjectMemberRole.EDITOR,
        created_by_user_id=user.id,
    )
    return WorkspaceGraph(
        user=user,
        organization=organization,
        workspace=workspace,
        workspace_membership=workspace_membership,
        accessible_project=accessible_project,
        hidden_project=hidden_project,
        foreign_workspace=foreign_workspace,
        foreign_workspace_membership=foreign_workspace_membership,
    )


async def test_concurrent_idempotent_create_persists_one_job_and_one_outbox(db_schema) -> None:
    _ = db_schema
    workspace_id = uuid4()
    definition = _definition(
        "workspace.export",
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.WORKSPACE,
    )
    registry = JobTypeRegistry([definition])
    publisher = RecordingEventPublisher()
    participant_count = 4
    repository = CoordinatedIdempotencyRepository(participant_count=participant_count)
    service = BackgroundJobService(
        get_settings(),
        repository=repository,
        registry=registry,
        event_publisher=publisher,
    )
    command = _job_command(
        definition,
        workspace_id=workspace_id,
        idempotency_key="same-export-request",
        correlation_id="concurrent-job-create",
    )
    tasks = [asyncio.create_task(service.create_job(command)) for _ in range(participant_count)]
    results = await asyncio.gather(*tasks)

    assert repository.preflight_reads == participant_count
    assert repository.recovered_conflicts == participant_count - 1
    assert len({job.id for job in results}) == 1
    assert await BackgroundJobRecord.all().count() == 1
    assert results[0].retry_policy == definition.retry_policy.model_dump(mode="json", by_alias=True)
    assert results[0].max_attempts == definition.retry_policy.max_attempts
    outboxes = await JobDispatchOutboxRecord.all()
    assert len(outboxes) == 1
    assert outboxes[0].job_id == results[0].id
    assert len(publisher.events) == 1


async def test_job_tables_are_usable_and_job_outbox_transaction_rolls_back(prepared_db) -> None:
    _ = prepared_db
    rows = await connections.get("default").execute_query_dict(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name IN "
        "('background_jobs', 'background_job_attempts', 'background_job_dispatch_outbox')"
    )
    assert {str(row["table_name"]) for row in rows} == JOB_TABLES

    definition = _definition(
        "workspace.rollback-probe",
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.WORKSPACE,
    )
    publisher = RecordingEventPublisher()
    service = BackgroundJobService(
        get_settings(),
        repository=DispatchFailureRepository(),
        registry=JobTypeRegistry([definition]),
        event_publisher=publisher,
    )
    workspace_id = uuid4()
    command = _job_command(
        definition,
        workspace_id=workspace_id,
        idempotency_key="rollback-probe",
        correlation_id="job-outbox-rollback",
    )

    with pytest.raises(RollbackProbe):
        await service.create_job(command)

    assert await BackgroundJobRecord.all().count() == 0
    assert await JobDispatchOutboxRecord.all().count() == 0
    assert publisher.events == []


async def test_workspace_visibility_filters_before_count_and_limit_and_tracks_membership(db_schema) -> None:
    _ = db_schema
    graph = await _create_workspace_graph()
    workspace_definition = _definition(
        "workspace.export",
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.WORKSPACE,
    )
    project_definition = _definition(
        "project.render",
        target_scope=JobTargetScope.PROJECT,
        visibility=JobVisibility.PROJECT,
    )
    owner_definition = _definition(
        "workspace.owner-report",
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.OWNER_ONLY,
    )
    system_definition = _definition(
        "system.retention",
        target_scope=JobTargetScope.SYSTEM,
        visibility=JobVisibility.SYSTEM,
    )
    registry = JobTypeRegistry([workspace_definition, project_definition, owner_definition, system_definition])
    visible_workspace_job = await _create_job(
        workspace_definition,
        workspace_id=graph.workspace.id,
        actor_user_id=uuid4(),
    )
    visible_project_job = await _create_job(
        project_definition,
        workspace_id=graph.workspace.id,
        project_id=graph.accessible_project.id,
        actor_user_id=uuid4(),
    )
    visible_owner_job = await _create_job(
        owner_definition,
        workspace_id=graph.workspace.id,
        actor_user_id=graph.user.id,
    )
    hidden_project_job = await _create_job(
        project_definition,
        workspace_id=graph.workspace.id,
        project_id=graph.hidden_project.id,
        actor_user_id=graph.user.id,
    )
    hidden_owner_job = await _create_job(
        owner_definition,
        workspace_id=graph.workspace.id,
        actor_user_id=uuid4(),
    )
    system_job = await _create_job(system_definition, workspace_id=None)
    foreign_workspace_job = await _create_job(
        workspace_definition,
        workspace_id=graph.foreign_workspace.id,
        actor_user_id=graph.user.id,
    )
    service = WorkspaceJobService(get_settings(), registry=registry)

    first_page = await service.list_jobs(
        workspace_id=graph.workspace.id,
        actor_user_id=graph.user.id,
        params=PageParams(page=1, size=2),
        filters=WorkspaceJobListQuery(),
    )
    second_page = await service.list_jobs(
        workspace_id=graph.workspace.id,
        actor_user_id=graph.user.id,
        params=PageParams(page=2, size=2),
        filters=WorkspaceJobListQuery(),
    )

    visible_ids = {visible_workspace_job.id, visible_project_job.id, visible_owner_job.id}
    returned_ids = {job.id for job in [*first_page.items, *second_page.items]}
    hidden_ids = {
        hidden_project_job.id,
        hidden_owner_job.id,
        system_job.id,
        foreign_workspace_job.id,
    }
    assert first_page.total == second_page.total == 3
    assert len(first_page.items) == 2
    assert len(second_page.items) == 1
    assert returned_ids == visible_ids
    assert returned_ids.isdisjoint(hidden_ids)

    await ProjectMembership.filter(
        project_id=graph.accessible_project.id,
        user_id=graph.user.id,
    ).delete()
    after_membership_removal = await service.list_jobs(
        workspace_id=graph.workspace.id,
        actor_user_id=graph.user.id,
        params=PageParams(page=1, size=10),
        filters=WorkspaceJobListQuery(),
    )
    assert after_membership_removal.total == 2
    assert {job.id for job in after_membership_removal.items} == {
        visible_workspace_job.id,
        visible_owner_job.id,
    }


async def test_cross_workspace_detail_lookup_applies_workspace_scope(db_schema) -> None:
    _ = db_schema
    graph = await _create_workspace_graph()
    definition = _definition(
        "workspace.export",
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.WORKSPACE,
    )
    job = await _create_job(
        definition,
        workspace_id=graph.workspace.id,
        actor_user_id=graph.user.id,
    )
    repository = BackgroundJobRepository()
    visible_result = await repository.get_visible_workspace_job(
        workspace_id=graph.workspace.id,
        job_id=job.id,
        actor_user_id=graph.user.id,
        accessible_project_ids=(),
        workspace_definitions=(definition,),
        project_definitions=(),
        owner_definitions=(),
    )
    foreign_result = await repository.get_visible_workspace_job(
        workspace_id=graph.foreign_workspace.id,
        job_id=job.id,
        actor_user_id=graph.user.id,
        accessible_project_ids=(),
        workspace_definitions=(definition,),
        project_definitions=(),
        owner_definitions=(),
    )

    assert visible_result is not None
    assert visible_result.id == job.id
    assert foreign_result is None


async def test_scoped_cancellation_locks_visible_job_and_rejects_foreign_workspace(db_schema) -> None:
    _ = db_schema
    graph = await _create_workspace_graph()
    definition = _definition(
        "workspace.export",
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.WORKSPACE,
        cancellable=True,
    )
    job = await _create_job(
        definition,
        workspace_id=graph.workspace.id,
        actor_user_id=graph.user.id,
    )
    publisher = RecordingEventPublisher()
    repository = ScopedCancellationLockProbeRepository(target_workspace_id=graph.workspace.id)
    service = WorkspaceJobService(
        get_settings(),
        repository=repository,
        registry=JobTypeRegistry([definition]),
        event_publisher=publisher,
    )
    foreign_context = WorkspaceContext(
        workspace_id=graph.foreign_workspace.id,
        organization_id=graph.organization.id,
        workspace_kind=graph.foreign_workspace.kind,
        access_type=WorkspaceAccessType.MEMBER,
        workspace_membership_id=graph.foreign_workspace_membership.id,
    )
    with pytest.raises(NotFound) as exc_info:
        await service.request_cancellation(
            ctx=foreign_context,
            job_id=job.id,
            actor_user_id=graph.user.id,
            payload=WorkspaceJobCancelRequest(reason="Foreign request"),
        )
    assert exc_info.value.error == "BACKGROUND_JOB_NOT_FOUND"
    await job.refresh_from_db()
    assert job.cancel_requested_at is None

    workspace_context = WorkspaceContext(
        workspace_id=graph.workspace.id,
        organization_id=graph.organization.id,
        workspace_kind=graph.workspace.kind,
        access_type=WorkspaceAccessType.MEMBER,
        workspace_membership_id=graph.workspace_membership.id,
    )
    first_task = asyncio.create_task(
        service.request_cancellation(
            ctx=workspace_context,
            job_id=job.id,
            actor_user_id=graph.user.id,
            payload=WorkspaceJobCancelRequest(reason="First reason"),
        )
    )
    second_task = None
    probe_error: Exception | None = None
    try:
        await asyncio.wait_for(
            repository.first_lock_acquired.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        second_task = asyncio.create_task(
            service.request_cancellation(
                ctx=workspace_context,
                job_id=job.id,
                actor_user_id=graph.user.id,
                payload=WorkspaceJobCancelRequest(reason="Replacement reason"),
            )
        )
        await asyncio.wait_for(
            repository.second_select_started.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        first_pid = repository.first_backend_pid
        second_pid = repository.second_backend_pid
        assert first_pid is not None
        assert second_pid is not None
        assert first_pid != second_pid
        await asyncio.wait_for(
            _wait_for_blocking_pid(
                blocked_pid=second_pid,
                blocker_pid=first_pid,
                select_completed=repository.second_select_completed,
            ),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        probe_error = exc
    finally:
        repository.release_first_lock.set()

    if second_task is None:
        await first_task
        if probe_error is not None:
            raise probe_error
        raise AssertionError("Second cancellation task was not started")
    first_result, second_result = await asyncio.gather(first_task, second_task)
    if probe_error is not None:
        raise probe_error

    await job.refresh_from_db()
    assert first_result.cancel_requested_at == NOW
    assert second_result.cancel_requested_at == NOW
    assert job.cancel_requested_at == NOW
    assert job.cancel_reason == "First reason"
    assert [event.name for event in publisher.events] == ["job.cancellation_requested"]


async def test_attempt_number_and_fencing_token_are_unique_in_database(db_schema) -> None:
    _ = db_schema
    definition = _definition(
        "workspace.attempt-probe",
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.WORKSPACE,
    )
    job = await _create_job(definition, workspace_id=uuid4())
    dispatch = await _create_dispatch(job)
    repository = BackgroundJobRepository()
    fencing_token = uuid4()

    async with in_transaction() as conn:
        attempt = await repository.create_attempt(
            job=job,
            dispatch=dispatch,
            fencing_token=fencing_token,
            worker_id="worker-1",
            started_at=NOW,
            lease_until=NOW + timedelta(seconds=definition.lease_seconds),
            conn=conn,
        )

    with pytest.raises(IntegrityError) as attempt_number_error:
        async with in_transaction() as conn:
            await repository.create_attempt(
                job=job,
                dispatch=dispatch,
                fencing_token=uuid4(),
                worker_id="worker-2",
                started_at=NOW,
                lease_until=NOW + timedelta(seconds=definition.lease_seconds),
                conn=conn,
            )
    assert _postgres_constraint_name(attempt_number_error.value) == ATTEMPT_NUMBER_CONSTRAINT

    await BackgroundJobRecord.filter(id=job.id).update(attempt_count=1)
    job = await BackgroundJobRecord.get(id=job.id)
    with pytest.raises(IntegrityError) as fencing_token_error:
        async with in_transaction() as conn:
            await repository.create_attempt(
                job=job,
                dispatch=dispatch,
                fencing_token=fencing_token,
                worker_id="worker-3",
                started_at=NOW,
                lease_until=NOW + timedelta(seconds=definition.lease_seconds),
                conn=conn,
            )
    assert _postgres_constraint_name(fencing_token_error.value) == FENCING_TOKEN_CONSTRAINT

    attempts = await JobAttemptRecord.filter(job_id=job.id).all()
    assert len(attempts) == 1
    assert attempts[0].id == attempt.id
    assert attempts[0].attempt_number == 1
    assert attempts[0].fencing_token == fencing_token
