from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
)
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_errors import (
    JobExecutionCancellationRequestedError,
    JobExecutionLeaseLostError,
    JobExecutionStateInvariantError,
)
from src.modules.jobs.execution_registry import (
    JobExecutionContext,
    JobExecutionRegistry,
    JobTypeRegistration,
)
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.execution_schema import (
    JobDeliveryCommand,
    JobDeliveryDisposition,
    JobProgressUpdate,
)
from src.modules.jobs.execution_service import BackgroundJobExecutionService
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.registry import JobTypeRegistry
from src.modules.jobs.schema import JobDispatchEnvelope

pytestmark = pytest.mark.unit

NOW = datetime(2026, 7, 15, 10, tzinfo=UTC)


class NoopThumbnailHandler:
    async def reconcile(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult | None:
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult:
        raise AssertionError("unit execution service never invokes the domain handler")

    async def cancel(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> None:
        return None


class FakeExecutionRepository:
    def __init__(
        self,
        *,
        job: BackgroundJobRecord,
        dispatches: list[JobDispatchOutboxRecord],
    ) -> None:
        self.job = job
        self.dispatches = dispatches
        self.attempts: list[JobAttemptRecord] = []
        self.database_time = NOW
        self.lock_calls: list[str] = []
        self.mutate_heartbeat_record = True

    async def get_job_for_update(self, *, job_id: UUID, conn: BaseDBAsyncClient):
        _ = conn
        self.lock_calls.append("job")
        return self.job if self.job.id == job_id else None

    async def get_job_dispatch_for_update(
        self,
        *,
        job_id: UUID,
        dispatch_sequence: int,
        conn: BaseDBAsyncClient,
    ):
        _ = conn
        self.lock_calls.append("dispatch")
        return next(
            (
                dispatch
                for dispatch in self.dispatches
                if dispatch.job_id == job_id and dispatch.dispatch_sequence == dispatch_sequence
            ),
            None,
        )

    async def get_active_attempt_for_update(self, *, job_id: UUID, conn: BaseDBAsyncClient):
        _ = conn
        self.lock_calls.append("active-attempt")
        return next(
            (
                attempt
                for attempt in self.attempts
                if attempt.job_id == job_id and attempt.status == JobAttemptStatus.RUNNING
            ),
            None,
        )

    async def get_attempt_for_update(self, *, attempt_id: UUID, conn: BaseDBAsyncClient):
        _ = conn
        self.lock_calls.append("attempt")
        return next((attempt for attempt in self.attempts if attempt.id == attempt_id), None)

    async def get_database_time(self, *, conn: BaseDBAsyncClient) -> datetime:
        _ = conn
        self.lock_calls.append("database-time")
        return self.database_time

    async def mark_dispatch_succeeded(
        self,
        *,
        dispatch: JobDispatchOutboxRecord,
        task_message_id: str | None,
        dispatched_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = conn
        dispatch.status = JobDispatchStatus.DISPATCHED
        dispatch.task_message_id = task_message_id
        dispatch.dispatched_at = dispatched_at
        dispatch.claim_token = None
        dispatch.lease_until = None

    async def mark_job_queued(self, *, job: BackgroundJobRecord, conn: BaseDBAsyncClient) -> None:
        _ = conn
        job.internal_status = JobInternalStatus.QUEUED

    async def create_attempt(
        self,
        *,
        job: BackgroundJobRecord,
        dispatch: JobDispatchOutboxRecord,
        fencing_token: UUID,
        worker_id: str,
        started_at: datetime,
        lease_until: datetime,
        conn: BaseDBAsyncClient,
    ) -> JobAttemptRecord:
        _ = conn
        attempt = JobAttemptRecord(
            id=uuid4(),
            job_id=job.id,
            dispatch_id=dispatch.id,
            attempt_number=job.attempt_count + 1,
            fencing_token=fencing_token,
            status=JobAttemptStatus.RUNNING,
            worker_id=worker_id,
            handler_version=job.job_type_version,
            claimed_at=started_at,
            lease_until=lease_until,
            heartbeat_at=started_at,
            timeout_at=(
                started_at + timedelta(seconds=job.timeout_seconds) if job.timeout_seconds is not None else None
            ),
            started_at=started_at,
        )
        cast(Any, attempt).job_id = job.id
        cast(Any, attempt).dispatch_id = dispatch.id
        self.attempts.append(attempt)
        return attempt

    async def mark_job_running(
        self,
        *,
        job: BackgroundJobRecord,
        started_at: datetime,
        initial_phase: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = conn
        job.internal_status = JobInternalStatus.RUNNING
        job.attempt_count += 1
        job.started_at = job.started_at or started_at
        job.next_attempt_at = None
        job.phase = initial_phase
        job.status_key = None
        job.progress_completed = 0

    async def heartbeat_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        heartbeat_at: datetime,
        lease_until: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = conn
        if self.mutate_heartbeat_record:
            attempt.heartbeat_at = heartbeat_at
            attempt.lease_until = lease_until

    async def update_job_fields(
        self,
        *,
        job: BackgroundJobRecord,
        fields: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = conn
        for field_name, value in fields.items():
            setattr(job, field_name, value)


class FakeTransactionExecutionService(BackgroundJobExecutionService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[BaseDBAsyncClient]:
        if conn is not None:
            yield conn
            return
        yield cast(BaseDBAsyncClient, SimpleNamespace())


def _settings() -> Settings:
    return Settings(app_env="test", database={"enabled": False})


def _service(
    *,
    job_status: JobInternalStatus = JobInternalStatus.PENDING_DISPATCH,
    dispatch_status: JobDispatchStatus = JobDispatchStatus.DISPATCHING,
) -> tuple[FakeTransactionExecutionService, FakeExecutionRepository, JobDeliveryCommand]:
    settings = _settings()
    definition = build_builtin_job_type_registry(settings).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    job_types = JobTypeRegistry((definition,), strict_contracts=True)
    asset_id = uuid4()
    workspace_id = uuid4()
    project_id = uuid4()
    target = AssetThumbnailJobTarget(
        workspace_id=workspace_id,
        project_id=project_id,
        entity_id=asset_id,
    )
    input_reference = AssetThumbnailJobInput(
        asset_id=asset_id,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
    )
    job = BackgroundJobRecord(
        id=uuid4(),
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        internal_status=job_status,
        retry_class=definition.retry_class,
        authority_mode=definition.authority_mode,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=uuid4(),
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        idempotency_scope_key=f"{workspace_id}:{project_id}:none",
        idempotency_key_hash="b" * 64,
        request_fingerprint="a" * 64,
        source_revision="c" * 64,
        correlation_id="execution-service-test",
        phase=definition.initial_phase,
        progress_completed=0,
        attempt_count=0,
        retry_policy=definition.retry_policy.model_dump(mode="json", by_alias=True),
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
    )
    envelope = JobDispatchEnvelope(
        job_id=job.id,
        dispatch_sequence=1,
        job_type=job.job_type,
        job_type_version=job.job_type_version,
        workload_class=job.workload_class,
        target_descriptor=job.target_descriptor,
        request_fingerprint=job.request_fingerprint,
    )
    serialized_envelope = envelope.model_dump(mode="json", by_alias=True)
    dispatch = JobDispatchOutboxRecord(
        id=uuid4(),
        job_id=job.id,
        dispatch_sequence=1,
        task_name=job.task_name,
        message_schema_version=1,
        envelope=serialized_envelope,
        envelope_hash=hash_json(serialized_envelope),
        status=dispatch_status,
        workload_class=job.workload_class,
        available_at=NOW,
        dispatch_attempt_count=1,
        claim_token=uuid4() if dispatch_status == JobDispatchStatus.DISPATCHING else None,
        lease_until=NOW + timedelta(seconds=30) if dispatch_status == JobDispatchStatus.DISPATCHING else None,
    )
    cast(Any, dispatch).job_id = job.id
    repository = FakeExecutionRepository(job=job, dispatches=[dispatch])
    execution_registry = JobExecutionRegistry(
        job_types=job_types,
        registrations=[
            JobTypeRegistration.from_definition(
                definition=definition,
                handler_factory=NoopThumbnailHandler,
            )
        ],
    )
    service = FakeTransactionExecutionService(
        settings,
        repository=cast(JobExecutionRepository, repository),
        job_types=job_types,
        executions=execution_registry,
    )
    command = JobDeliveryCommand(
        task_name=job.task_name,
        envelope=envelope,
        worker_id="asset-worker-1",
        transport_message_id="taskiq-message-1",
        received_at=NOW,
    )
    return service, repository, command


@pytest.mark.asyncio
async def test_exact_dispatching_delivery_reconciles_and_claims_one_fenced_attempt() -> None:
    service, repository, command = _service()

    claim = await service.accept_delivery(command)

    assert claim.disposition == JobDeliveryDisposition.CLAIMED
    assert claim.lease is not None
    assert claim.lease.attempt_number == claim.lease.dispatch_sequence == 1
    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.job.attempt_count == 1
    assert len(repository.attempts) == 1
    assert repository.dispatches[0].status == JobDispatchStatus.DISPATCHED
    assert repository.dispatches[0].task_message_id == "taskiq-message-1"
    assert repository.lock_calls == ["dispatch", "job", "active-attempt", "database-time"]


@pytest.mark.asyncio
async def test_transport_receipt_time_cannot_backdate_or_extend_execution_authority() -> None:
    service, repository, command = _service()
    repository.database_time = NOW + timedelta(minutes=5)

    claim = await service.accept_delivery(command.model_copy(update={"received_at": NOW - timedelta(days=365)}))

    assert claim.lease is not None
    assert claim.lease.claimed_at == repository.database_time
    assert claim.lease.lease_until == repository.database_time + timedelta(seconds=90)
    assert repository.dispatches[0].dispatched_at == repository.database_time


@pytest.mark.asyncio
async def test_duplicate_delivery_observes_active_attempt_without_creating_another() -> None:
    service, repository, command = _service()
    first = await service.accept_delivery(command)

    repository.database_time = NOW + timedelta(seconds=1)
    duplicate = await service.accept_delivery(command)

    assert first.lease is not None
    assert duplicate.disposition == JobDeliveryDisposition.ACTIVE_ATTEMPT_DUPLICATE
    assert duplicate.active_attempt_id == first.lease.attempt_id
    assert len(repository.attempts) == 1


@pytest.mark.asyncio
async def test_expired_active_attempt_requires_reaper_and_never_grants_new_fence() -> None:
    service, repository, command = _service()
    first = await service.accept_delivery(command)
    assert first.lease is not None
    repository.attempts[0].lease_until = NOW + timedelta(seconds=1)

    repository.database_time = NOW + timedelta(seconds=1)
    duplicate = await service.accept_delivery(command)

    assert duplicate.disposition == JobDeliveryDisposition.LEASE_REAP_REQUIRED
    assert duplicate.lease is None
    assert len(repository.attempts) == 1


@pytest.mark.asyncio
async def test_old_sequence_is_acknowledged_as_stale_after_attempt_finishes() -> None:
    service, repository, command = _service()
    await service.accept_delivery(command)
    repository.attempts[0].status = JobAttemptStatus.FAILED
    repository.job.internal_status = JobInternalStatus.RETRY_SCHEDULED

    stale = await service.accept_delivery(command)

    assert stale.disposition == JobDeliveryDisposition.STALE_DELIVERY
    assert len(repository.attempts) == 1


@pytest.mark.asyncio
async def test_retry_delivery_resets_attempt_scoped_progress_before_granting_lease() -> None:
    service, repository, command = _service()
    first = await service.accept_delivery(command)
    assert first.lease is not None
    initial_phase = repository.job.phase
    repository.attempts[0].status = JobAttemptStatus.LEASE_EXPIRED
    repository.job.internal_status = JobInternalStatus.RETRY_SCHEDULED
    repository.job.phase = "persisting"
    repository.job.status_key = "jobs.thumbnail.persisting"
    repository.job.progress_completed = 4
    repository.job.progress_total = 5
    retry_envelope = command.envelope.model_copy(update={"dispatch_sequence": 2})
    serialized_envelope = retry_envelope.model_dump(mode="json", by_alias=True)
    retry_dispatch = JobDispatchOutboxRecord(
        id=uuid4(),
        job_id=repository.job.id,
        dispatch_sequence=2,
        task_name=repository.job.task_name,
        message_schema_version=1,
        envelope=serialized_envelope,
        envelope_hash=hash_json(serialized_envelope),
        status=JobDispatchStatus.DISPATCHED,
        workload_class=repository.job.workload_class,
        available_at=NOW,
        dispatch_attempt_count=1,
        dispatched_at=NOW,
        task_message_id="taskiq-message-2",
    )
    cast(Any, retry_dispatch).job_id = repository.job.id
    repository.dispatches.append(retry_dispatch)

    retry = await service.accept_delivery(
        command.model_copy(
            update={
                "envelope": retry_envelope,
                "transport_message_id": "taskiq-message-2",
            }
        )
    )

    assert retry.disposition == JobDeliveryDisposition.CLAIMED
    assert retry.lease is not None
    assert retry.lease.attempt_number == 2
    assert repository.job.phase == initial_phase
    assert repository.job.status_key is None
    assert repository.job.progress_completed == 0
    assert repository.job.progress_total == 5


@pytest.mark.asyncio
async def test_terminal_job_returns_terminal_duplicate_without_side_effect() -> None:
    service, repository, command = _service(
        job_status=JobInternalStatus.SUCCEEDED,
        dispatch_status=JobDispatchStatus.DISPATCHED,
    )

    duplicate = await service.accept_delivery(command)

    assert duplicate.disposition == JobDeliveryDisposition.TERMINAL_DUPLICATE
    assert duplicate.terminal_status == JobInternalStatus.SUCCEEDED
    assert repository.attempts == []


@pytest.mark.asyncio
async def test_terminal_job_with_active_attempt_surfaces_state_invariant() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    repository.job.internal_status = JobInternalStatus.SUCCEEDED

    with pytest.raises(JobExecutionStateInvariantError, match="still owns active Attempt"):
        await service.accept_delivery(command)


@pytest.mark.asyncio
async def test_prepare_execution_returns_locked_canonical_snapshot_and_renews_fence() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    repository.database_time = NOW + timedelta(seconds=30)
    repository.job.cancel_requested_at = NOW + timedelta(seconds=10)
    repository.job.cancel_reason = "Stop after the current effect"

    preparation = await service.prepare_execution(lease=claim.lease)

    assert preparation.lease == claim.lease
    assert preparation.target_descriptor == repository.job.target_descriptor
    assert preparation.input_reference == repository.job.input_reference
    assert preparation.source_revision == repository.job.source_revision
    assert preparation.request_fingerprint == repository.job.request_fingerprint
    assert preparation.correlation_id == repository.job.correlation_id
    assert preparation.control.cancellation_requested is True
    assert preparation.control.cancel_reason == "Stop after the current effect"
    assert preparation.control.observed_at == repository.database_time
    assert preparation.control.lease_until == repository.database_time + timedelta(seconds=90)
    assert repository.attempts[0].heartbeat_at == repository.database_time


@pytest.mark.asyncio
async def test_prepare_execution_rejects_invalid_canonical_snapshot_before_heartbeat() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    original_heartbeat = repository.attempts[0].heartbeat_at
    repository.job.input_reference = None
    repository.database_time = NOW + timedelta(seconds=30)

    with pytest.raises(JobExecutionStateInvariantError, match="canonical execution snapshot is invalid"):
        await service.prepare_execution(lease=claim.lease)

    assert repository.attempts[0].heartbeat_at == original_heartbeat


@pytest.mark.asyncio
async def test_pre_attempt_cancellation_is_terminalized_only_after_exact_delivery() -> None:
    service, repository, command = _service()
    repository.job.cancel_requested_at = NOW - timedelta(seconds=1)
    repository.job.cancel_requested_by_user_id = uuid4()

    cancelled = await service.accept_delivery(command)

    assert cancelled.disposition == JobDeliveryDisposition.CANCELLED_BEFORE_ATTEMPT
    assert repository.job.internal_status == JobInternalStatus.CANCELLED
    assert repository.job.cancellation_acknowledged_at == NOW
    assert repository.attempts == []


@pytest.mark.asyncio
async def test_pending_outbox_cannot_be_claimed_from_an_impossible_transport_delivery() -> None:
    service, repository, command = _service(dispatch_status=JobDispatchStatus.PENDING)

    with pytest.raises(Conflict) as exc_info:
        await service.accept_delivery(command)

    assert exc_info.value.error == "BACKGROUND_JOB_DISPATCH_NOT_READY"
    assert repository.attempts == []


@pytest.mark.asyncio
async def test_checkpoint_renews_fence_and_persists_absolute_progress() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    repository.job.cancel_requested_at = NOW + timedelta(seconds=10)
    repository.job.cancel_reason = "Stop after the current render step"
    repository.database_time = NOW + timedelta(seconds=30)

    control = await service.checkpoint_execution(
        lease=claim.lease,
        progress=JobProgressUpdate(
            phase="generating",
            status_key="jobs.assetThumbnail.generating",
            progress_completed=1,
            progress_total=4,
        ),
    )

    assert control.cancellation_requested is True
    assert control.cancel_reason == "Stop after the current render step"
    assert control.lease_until == NOW + timedelta(seconds=120)
    assert repository.job.phase == "generating"
    assert repository.job.progress_completed == 1
    assert repository.job.progress_total == 4


@pytest.mark.asyncio
async def test_checkpoint_snapshot_does_not_depend_on_repository_object_mutation() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    repository.database_time = NOW + timedelta(seconds=30)
    repository.mutate_heartbeat_record = False

    control = await service.checkpoint_execution(lease=claim.lease)

    assert control.observed_at == repository.database_time
    assert control.lease_until == repository.database_time + timedelta(seconds=90)
    assert repository.attempts[0].lease_until == claim.lease.lease_until


@pytest.mark.asyncio
async def test_fenced_domain_commit_rejects_cancellation_before_callback() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    repository.job.cancel_requested_at = NOW + timedelta(seconds=1)
    callback_called = False

    async def commit() -> str:
        nonlocal callback_called
        callback_called = True
        return "committed"

    with pytest.raises(JobExecutionCancellationRequestedError):
        await service.run_fenced_domain_commit(lease=claim.lease, operation=commit)

    assert callback_called is False


@pytest.mark.asyncio
async def test_fenced_domain_commit_rejects_stale_generation_before_callback() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    repository.job.attempt_count = 2
    callback_called = False

    async def commit() -> str:
        nonlocal callback_called
        callback_called = True
        return "committed"

    with pytest.raises(JobExecutionLeaseLostError):
        await service.run_fenced_domain_commit(lease=claim.lease, operation=commit)

    assert callback_called is False


@pytest.mark.asyncio
async def test_checkpoint_rejects_completed_progress_beyond_existing_total() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    repository.job.progress_completed = 1
    repository.job.progress_total = 4
    repository.database_time = NOW + timedelta(seconds=1)

    with pytest.raises(Conflict) as exc_info:
        await service.checkpoint_execution(
            lease=claim.lease,
            progress=JobProgressUpdate(
                phase="generating",
                progress_completed=5,
            ),
        )

    assert exc_info.value.error == "BACKGROUND_JOB_NOT_CLAIMABLE"
    assert repository.job.progress_completed == 1
    assert repository.job.progress_total == 4


@pytest.mark.asyncio
async def test_checkpoint_rejects_a_stale_attempt_generation() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    repository.job.attempt_count = 2
    repository.database_time = NOW + timedelta(seconds=1)

    with pytest.raises(JobExecutionLeaseLostError):
        await service.checkpoint_execution(lease=claim.lease)


@pytest.mark.asyncio
async def test_checkpoint_rejects_database_clock_regression() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    repository.database_time = NOW - timedelta(microseconds=1)

    with pytest.raises(JobExecutionLeaseLostError):
        await service.checkpoint_execution(lease=claim.lease)


@pytest.mark.asyncio
async def test_runtime_registration_workload_must_match_all_persisted_delivery_records() -> None:
    service, repository, command = _service()
    mismatched_envelope = command.envelope.model_copy(update={"workload_class": JobWorkloadClass.PUBLISH})
    repository.job.workload_class = JobWorkloadClass.PUBLISH
    repository.dispatches[0].workload_class = JobWorkloadClass.PUBLISH
    repository.dispatches[0].envelope = mismatched_envelope.model_dump(mode="json", by_alias=True)
    repository.dispatches[0].envelope_hash = hash_json(repository.dispatches[0].envelope)

    with pytest.raises(Conflict) as exc_info:
        await service.accept_delivery(command.model_copy(update={"envelope": mismatched_envelope}))

    assert exc_info.value.error == "BACKGROUND_JOB_DISPATCH_ENVELOPE_MISMATCH"
    assert repository.attempts == []


@pytest.mark.asyncio
async def test_expired_fence_cannot_heartbeat_or_write_progress() -> None:
    service, repository, command = _service()
    claim = await service.accept_delivery(command)
    assert claim.lease is not None
    expired_at = repository.attempts[0].lease_until
    repository.database_time = expired_at

    with pytest.raises(JobExecutionLeaseLostError):
        await service.checkpoint_execution(
            lease=claim.lease,
            progress=JobProgressUpdate(
                phase="generating",
                progress_completed=1,
                progress_total=4,
            ),
        )

    assert repository.job.progress_completed == 0
