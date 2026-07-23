from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict, ValidationError
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.events import Event
from src.core.exceptions import Conflict
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAuthorityMode,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
    JobRetryClass,
    JobWorkloadClass,
)
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
    validate_asset_thumbnail_target_input,
)
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
from src.modules.jobs.schema import BackgroundJobCreate
from src.modules.jobs.service import BackgroundJobService


class FakeEventPublisher:
    def __init__(self) -> None:
        self.events: list[Event] = []
        self.is_transaction_active: Callable[[], bool] = lambda: False
        self.transaction_active_when_published: list[bool] = []

    async def publish(self, event: Event) -> None:
        self.events.append(event)
        self.transaction_active_when_published.append(self.is_transaction_active())


class FakeBackgroundJobRepository:
    def __init__(self) -> None:
        self.jobs: dict[UUID, BackgroundJobRecord] = {}
        self.jobs_by_key: dict[str, BackgroundJobRecord] = {}
        self.dispatches: list[JobDispatchOutboxRecord] = []
        self.concurrent_jobs_by_key: dict[str, BackgroundJobRecord] = {}
        self.simulate_integrity_race = False

    async def get_by_idempotency_hash(self, *, idempotency_key_hash: str, conn=None):
        _ = conn
        return self.jobs_by_key.get(idempotency_key_hash) or self.concurrent_jobs_by_key.get(idempotency_key_hash)

    async def create_job(
        self,
        *,
        command: BackgroundJobCreate,
        definition: JobTypeDefinition,
        idempotency_scope_key: str,
        idempotency_key_hash: str,
        request_fingerprint: str,
        conn,
    ):
        _ = conn
        job = BackgroundJobRecord(
            id=uuid4(),
            job_type=command.job_type,
            job_type_version=command.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            internal_status=JobInternalStatus.PENDING_DISPATCH,
            retry_class=definition.retry_class,
            authority_mode=definition.authority_mode,
            workspace_id=command.workspace_id,
            project_id=command.project_id,
            site_id=command.site_id,
            actor_user_id=command.actor_user_id,
            target_descriptor=command.target_descriptor,
            input_reference=command.input_reference,
            idempotency_scope_key=idempotency_scope_key,
            idempotency_key_hash=idempotency_key_hash,
            request_fingerprint=request_fingerprint,
            source_revision=command.source_revision,
            correlation_id=command.correlation_id,
            trace_id=command.trace_id,
            progress_completed=0,
            attempt_count=0,
            retry_policy=definition.retry_policy.model_dump(mode="json", by_alias=True),
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            retry_of_job_id=command.retry_of_job_id,
            phase=definition.initial_phase,
            status_key=definition.initial_status_key or command.status_key,
        )
        if self.simulate_integrity_race:
            self.simulate_integrity_race = False
            self.concurrent_jobs_by_key[idempotency_key_hash] = job
            raise IntegrityError("simulated idempotency uniqueness race")
        self.jobs[job.id] = job
        self.jobs_by_key[idempotency_key_hash] = job
        return job

    async def create_dispatch(
        self,
        *,
        job,
        dispatch_sequence: int,
        task_name: str,
        envelope,
        envelope_hash: str,
        available_at: datetime,
        conn,
    ):
        _ = conn
        dispatch = JobDispatchOutboxRecord(
            id=uuid4(),
            job_id=job.id,
            dispatch_sequence=dispatch_sequence,
            task_name=task_name,
            message_schema_version=envelope.message_schema_version,
            envelope=envelope.model_dump(mode="json", by_alias=True),
            envelope_hash=envelope_hash,
            status=JobDispatchStatus.PENDING,
            workload_class=job.workload_class,
            available_at=available_at,
            dispatch_attempt_count=0,
        )
        cast(Any, dispatch).job_id = job.id
        self.dispatches.append(dispatch)
        return dispatch

    async def get_job_for_update(self, *, job_id: UUID, conn):
        _ = conn
        return self.jobs.get(job_id)

    async def update_job_fields(self, *, job, fields: dict[str, object], conn) -> None:
        _ = conn
        for name, value in fields.items():
            setattr(job, name, value)


class FakeTransactionConnection(BaseModel):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    repository: FakeBackgroundJobRepository

    @asynccontextmanager
    async def _in_transaction(self) -> AsyncIterator[FakeTransactionConnection]:
        snapshot = (
            dict(self.repository.jobs),
            dict(self.repository.jobs_by_key),
            list(self.repository.dispatches),
        )
        try:
            yield self
        except BaseException:
            self.repository.jobs.clear()
            self.repository.jobs.update(snapshot[0])
            self.repository.jobs_by_key.clear()
            self.repository.jobs_by_key.update(snapshot[1])
            self.repository.dispatches[:] = snapshot[2]
            raise


class FakeTransactionJobService(BackgroundJobService):
    transaction_depth = 0

    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[object]:
        if conn is not None:
            yield conn
            return
        connection = FakeTransactionConnection(
            repository=cast(FakeBackgroundJobRepository, self.repository),
        )
        self.transaction_depth += 1
        try:
            async with connection._in_transaction() as transaction_conn:
                yield transaction_conn
        finally:
            self.transaction_depth -= 1


def create_definition(
    *,
    job_type: str = "asset.thumbnail.generate",
    task_name: str = "jobs:asset-cpu:asset-thumbnail-generate:v1",
    max_attempts: int = 1,
) -> JobTypeDefinition:
    permission = JobPermissionRequirement(
        scope=JobPermissionScope.WORKSPACE,
        action="system:assets:manage",
    )
    retry_class = JobRetryClass.NONE if max_attempts == 1 else JobRetryClass.TRANSIENT
    retryable_codes = (
        frozenset() if max_attempts == 1 else frozenset({"BACKGROUND_JOB_WORKER_LOST", "PROVIDER_UNAVAILABLE"})
    )
    return JobTypeDefinition(
        job_type=job_type,
        job_type_version=1,
        task_name=task_name,
        workload_class=JobWorkloadClass.ASSET_CPU,
        target_scope=JobTargetScope.PROJECT,
        visibility=JobVisibility.PROJECT,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=permission,
        manage_permission=permission,
        initial_phase="queued",
        phases=frozenset({"queued", "generating"}),
        cancellable_phases=frozenset({"queued", "generating"}),
        retry_class=retry_class,
        retry_policy=JobRetryPolicy(
            max_attempts=max_attempts,
            initial_delay_seconds=5,
            multiplier=2,
            maximum_delay_seconds=60,
            retryable_codes=retryable_codes,
        ),
        timeout_seconds=None,
        lease_seconds=90,
        heartbeat_seconds=30,
        idempotency_namespace=job_type,
        target_schema=AssetThumbnailJobTarget,
        input_reference_schema=AssetThumbnailJobInput,
        result_reference_schema=AssetThumbnailJobResult,
        cross_field_validator=validate_asset_thumbnail_target_input,
    )


def create_service(
    *,
    max_attempts: int = 1,
    definitions: list[JobTypeDefinition] | None = None,
) -> tuple[FakeTransactionJobService, FakeBackgroundJobRepository, FakeEventPublisher]:
    repository = FakeBackgroundJobRepository()
    publisher = FakeEventPublisher()
    service = FakeTransactionJobService(
        Settings(app_env="test", database={"enabled": False}),
        repository=cast(BackgroundJobRepository, repository),
        registry=JobTypeRegistry(
            definitions if definitions is not None else [create_definition(max_attempts=max_attempts)],
            strict_contracts=False,
        ),
        event_publisher=publisher,
    )
    publisher.is_transaction_active = lambda: service.transaction_depth > 0
    return service, repository, publisher


def create_command(
    *,
    max_attempts: int = 1,
    job_type: str = "asset.thumbnail.generate",
    task_name: str = "jobs:asset-cpu:asset-thumbnail-generate:v1",
) -> BackgroundJobCreate:
    workspace_id = uuid4()
    project_id = uuid4()
    asset_id = uuid4()
    target = AssetThumbnailJobTarget(
        workspace_id=workspace_id,
        project_id=project_id,
        entity_id=asset_id,
    )
    input_reference = AssetThumbnailJobInput(
        asset_id=asset_id,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
    )
    retry_class = JobRetryClass.NONE if max_attempts == 1 else JobRetryClass.TRANSIENT
    return BackgroundJobCreate(
        job_type=job_type,
        task_name=task_name,
        workload_class=JobWorkloadClass.ASSET_CPU,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=uuid4(),
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        idempotency_key="asset-version-1",
        correlation_id="test-correlation",
        retry_class=retry_class,
        max_attempts=max_attempts,
        lease_seconds=90,
        heartbeat_seconds=30,
    )


@pytest.mark.asyncio
async def test_create_job_persists_job_and_dispatch_once_for_idempotency_key() -> None:
    service, repository, publisher = create_service()
    command = create_command()

    first = await service.create_job(command)
    second = await service.create_job(command)

    assert second is first
    assert len(repository.jobs) == 1
    assert len(repository.dispatches) == 1
    assert [event.name for event in publisher.events] == ["job.created"]
    assert publisher.transaction_active_when_published == [False]


@pytest.mark.asyncio
async def test_create_job_uses_explicit_dispatch_after_for_outbox_availability() -> None:
    service, repository, _ = create_service()
    dispatch_after = datetime(2030, 1, 2, 3, 4, tzinfo=UTC)

    await service.create_job(create_command().model_copy(update={"dispatch_after": dispatch_after}))

    assert len(repository.dispatches) == 1
    assert repository.dispatches[0].available_at == dispatch_after


def test_background_job_create_rejects_naive_dispatch_after() -> None:
    command = create_command()
    with pytest.raises(ValidationError, match="dispatchAfter must include a timezone"):
        BackgroundJobCreate.model_validate({
            **command.model_dump(),
            "dispatch_after": datetime(2030, 1, 2, 3, 4),
        })


@pytest.mark.asyncio
async def test_create_job_in_transaction_rolls_back_job_and_dispatch_without_event() -> None:
    service, repository, publisher = create_service()

    with pytest.raises(RuntimeError, match="rollback caller transaction"):
        async with service.tx() as conn:
            result = await service.create_job_in_transaction(
                command=create_command(),
                conn=cast(Any, conn),
            )
            assert result.created is True
            assert len(repository.jobs) == 1
            assert len(repository.dispatches) == 1
            assert publisher.events == []
            raise RuntimeError("rollback caller transaction")

    assert repository.jobs == {}
    assert repository.jobs_by_key == {}
    assert repository.dispatches == []
    assert publisher.events == []


@pytest.mark.asyncio
async def test_create_job_in_transaction_publishes_once_only_after_explicit_commit_step() -> None:
    service, _, publisher = create_service()
    command = create_command()

    async with service.tx() as conn:
        created = await service.create_job_in_transaction(command=command, conn=cast(Any, conn))
        assert created.created is True
        assert publisher.events == []

    await service.publish_created_after_commit(created)
    async with service.tx() as conn:
        replayed = await service.create_job_in_transaction(command=command, conn=cast(Any, conn))
        assert replayed.created is False
        assert replayed.job is created.job
        assert publisher.events[0].name == "job.created"

    await service.publish_created_after_commit(replayed)

    assert [event.name for event in publisher.events] == ["job.created"]
    assert publisher.transaction_active_when_published == [False]


@pytest.mark.asyncio
async def test_create_job_in_transaction_recovers_integrity_race_as_replay() -> None:
    service, repository, publisher = create_service()
    repository.simulate_integrity_race = True

    async with service.tx() as conn:
        result = await service.create_job_in_transaction(
            command=create_command(),
            conn=cast(Any, conn),
        )

    assert result.created is False
    assert result.job in repository.concurrent_jobs_by_key.values()
    assert repository.jobs == {}
    assert repository.dispatches == []
    assert publisher.events == []


@pytest.mark.asyncio
async def test_create_job_rejects_idempotency_key_reuse_with_different_fingerprint() -> None:
    service, _, _ = create_service()
    command = create_command()
    await service.create_job(command)
    changed_input = dict(command.input_reference or {})
    changed_input["thumbnailProfileVersion"] = ASSET_THUMBNAIL_PROFILE_VERSION + 1

    with pytest.raises(Conflict) as exc_info:
        await service.create_job(command.model_copy(update={"input_reference": changed_input}))

    assert exc_info.value.error == "BACKGROUND_JOB_IDEMPOTENCY_CONFLICT"


@pytest.mark.asyncio
async def test_idempotency_key_is_scoped_by_job_type() -> None:
    second_definition = create_definition(
        job_type="asset.metadata.extract",
        task_name="jobs:asset-cpu:asset-metadata-extract:v1",
    )
    service, repository, _ = create_service(definitions=[create_definition(), second_definition])
    first_command = create_command()
    second_command = first_command.model_copy(
        update={
            "job_type": second_definition.job_type,
            "task_name": second_definition.task_name,
        }
    )

    first = await service.create_job(first_command)
    second = await service.create_job(second_command)

    assert first.id != second.id
    assert len(repository.jobs) == 2
    assert len(repository.dispatches) == 2


@pytest.mark.asyncio
async def test_create_job_rejects_unregistered_type() -> None:
    service, _, _ = create_service(definitions=[])

    with pytest.raises(Conflict) as exc_info:
        await service.create_job(create_command())

    assert exc_info.value.error == "BACKGROUND_JOB_TYPE_NOT_REGISTERED"


@pytest.mark.asyncio
async def test_create_job_rejects_registry_contract_mismatch() -> None:
    service, repository, _ = create_service()
    command = create_command().model_copy(update={"workload_class": JobWorkloadClass.PUBLISH})

    with pytest.raises(Conflict) as exc_info:
        await service.create_job(command)

    assert exc_info.value.error == "BACKGROUND_JOB_TYPE_CONTRACT_MISMATCH"
    assert repository.jobs == {}


@pytest.mark.asyncio
async def test_create_job_rejects_target_scope_mismatch() -> None:
    service, repository, _ = create_service()
    command = create_command().model_copy(update={"site_id": uuid4()})

    with pytest.raises(Conflict) as exc_info:
        await service.create_job(command)

    assert exc_info.value.error == "BACKGROUND_JOB_TYPE_CONTRACT_MISMATCH"
    assert repository.jobs == {}


@pytest.mark.asyncio
async def test_create_job_accepts_canonical_encoded_target_and_compares_internal_ids() -> None:
    service, repository, _ = create_service()
    command = create_command()

    created = await service.create_job(command)

    assert command.target_descriptor["workspaceId"] != str(command.workspace_id)
    assert command.target_descriptor["projectId"] != str(command.project_id)
    assert created.workspace_id == command.workspace_id
    assert created.project_id == command.project_id
    assert created.target_descriptor == command.target_descriptor
    assert len(repository.jobs) == 1


@pytest.mark.asyncio
async def test_create_job_rejects_encoded_target_that_resolves_to_another_workspace() -> None:
    service, repository, _ = create_service()
    command = create_command().model_copy(update={"workspace_id": uuid4()})

    with pytest.raises(Conflict) as exc_info:
        await service.create_job(command)

    assert exc_info.value.error == "BACKGROUND_JOB_TYPE_CONTRACT_MISMATCH"
    assert repository.jobs == {}
    assert repository.dispatches == []


@pytest.mark.asyncio
@pytest.mark.parametrize("reference_field", ["target_descriptor", "input_reference"])
async def test_create_job_maps_schema_extras_to_contract_mismatch_without_writes(reference_field: str) -> None:
    service, repository, _ = create_service()
    command = create_command()
    invalid_reference = dict(getattr(command, reference_field) or {})
    invalid_reference["schemaName"] = "tenant_authority_must_not_cross_boundary"

    with pytest.raises(Conflict) as exc_info:
        await service.create_job(command.model_copy(update={reference_field: invalid_reference}))

    assert exc_info.value.error == "BACKGROUND_JOB_TYPE_CONTRACT_MISMATCH"
    assert repository.jobs == {}
    assert repository.dispatches == []


@pytest.mark.asyncio
async def test_create_job_rejects_cross_field_mismatch_without_writes() -> None:
    service, repository, _ = create_service()
    command = create_command()
    mismatched_input = AssetThumbnailJobInput(
        asset_id=uuid4(),
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
    )

    with pytest.raises(Conflict) as exc_info:
        await service.create_job(
            command.model_copy(update={"input_reference": mismatched_input.model_dump(mode="json", by_alias=True)})
        )

    assert exc_info.value.error == "BACKGROUND_JOB_TYPE_CONTRACT_MISMATCH"
    assert repository.jobs == {}
    assert repository.dispatches == []


def test_create_job_rejects_lease_shorter_than_three_heartbeats() -> None:
    payload = create_command().model_dump()
    payload.update({"lease_seconds": 59, "heartbeat_seconds": 20})
    with pytest.raises(ValidationError, match="three heartbeat intervals"):
        BackgroundJobCreate.model_validate(payload)


@pytest.mark.asyncio
async def test_request_cancellation_records_request_without_claiming_terminal_state() -> None:
    service, _, _ = create_service()
    job = await service.create_job(create_command())
    job.internal_status = JobInternalStatus.QUEUED
    requested_at = datetime(2026, 7, 15, 12, tzinfo=UTC)

    result = await service.request_cancellation(
        job_id=job.id,
        requested_by_user_id=uuid4(),
        requested_at=requested_at,
    )

    assert result.cancel_requested_at == requested_at
    assert result.internal_status == JobInternalStatus.QUEUED


@pytest.mark.asyncio
async def test_terminal_job_returns_existing_state_for_cancellation_request() -> None:
    service, _, _ = create_service()
    job = await service.create_job(create_command())
    job.internal_status = JobInternalStatus.SUCCEEDED

    result = await service.request_cancellation(job_id=job.id, requested_by_user_id=uuid4())

    assert result.internal_status == JobInternalStatus.SUCCEEDED
    assert result.cancel_requested_at is None
