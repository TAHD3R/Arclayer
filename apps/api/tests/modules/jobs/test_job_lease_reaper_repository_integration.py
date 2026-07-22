from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
)
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
)
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_errors import JobExecutionLeaseLostError
from src.modules.jobs.execution_registry import (
    JobExecutionContext,
    JobExecutionRegistry,
    JobTypeRegistration,
)
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.execution_schema import JobExecutionLease
from src.modules.jobs.execution_service import BackgroundJobExecutionService
from src.modules.jobs.execution_validation import to_execution_lease
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.reaper_schema import JobLeaseReapCandidate
from src.modules.jobs.reaper_service import (
    BackgroundJobLeaseReaperService,
    JobLeaseReaperInvariantError,
)
from src.modules.jobs.registry import JobTypeDefinition, JobTypeRegistry
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.schema import BackgroundJobFailure, build_job_dispatch_envelope

pytestmark = pytest.mark.integration

LOCK_PROBE_TIMEOUT_SECONDS = 5.0
WORKER_LOST_ERROR_CODE = "BACKGROUND_JOB_WORKER_LOST"


class NoopThumbnailHandler:
    async def reconcile(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult | None:
        _ = context
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult:
        _ = context
        raise AssertionError("checkpoint integration must not invoke the domain handler")

    async def cancel(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> None:
        _ = context


class CandidateBarrierRepository(BackgroundJobRepository):
    """Make two unlocked scans observe the same committed expiration candidate."""

    def __init__(self) -> None:
        super().__init__()
        self._read_count = 0
        self._read_lock = asyncio.Lock()
        self.all_candidates_read = asyncio.Event()
        self.backend_pids: set[int] = set()

    async def list_expired_attempt_candidates(
        self,
        *,
        now: datetime,
        limit: int,
        conn: BaseDBAsyncClient,
    ) -> list[JobLeaseReapCandidate]:
        candidates = await super().list_expired_attempt_candidates(now=now, limit=limit, conn=conn)
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))
        async with self._read_lock:
            self._read_count += 1
            if self._read_count == 2:
                self.all_candidates_read.set()
        await self.all_candidates_read.wait()
        return candidates


class CheckpointWinsRepository(BackgroundJobRepository):
    """Pause a valid checkpoint before its heartbeat write crosses the old lease boundary."""

    def __init__(self) -> None:
        super().__init__()
        self.checkpoint_validated = asyncio.Event()
        self.allow_checkpoint_write = asyncio.Event()
        self.candidate_selected = asyncio.Event()
        self.candidate_time: datetime | None = None

    async def heartbeat_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        heartbeat_at: datetime,
        lease_until: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        self.checkpoint_validated.set()
        await self.allow_checkpoint_write.wait()
        await super().heartbeat_attempt(
            attempt=attempt,
            heartbeat_at=heartbeat_at,
            lease_until=lease_until,
            conn=conn,
        )

    async def list_expired_attempt_candidates(
        self,
        *,
        now: datetime,
        limit: int,
        conn: BaseDBAsyncClient,
    ) -> list[JobLeaseReapCandidate]:
        candidates = await super().list_expired_attempt_candidates(now=now, limit=limit, conn=conn)
        self.candidate_time = now
        if candidates:
            self.candidate_selected.set()
        return candidates


class ExactAfterCheckpointRepository(CheckpointWinsRepository):
    """Expose when exact reaping is waiting behind a checkpoint's Job lock."""

    def __init__(self) -> None:
        super().__init__()
        self._job_lock_count = 0
        self._job_lock_guard = asyncio.Lock()
        self.exact_reaper_contending = asyncio.Event()

    async def get_job_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobRecord | None:
        async with self._job_lock_guard:
            self._job_lock_count += 1
            if self._job_lock_count == 2:
                self.exact_reaper_contending.set()
        return await super().get_job_for_update(job_id=job_id, conn=conn)


class ReaperWinsRepository(BackgroundJobRepository):
    """Hold the reaper's Job/Attempt locks while a stale checkpoint contends."""

    def __init__(self) -> None:
        super().__init__()
        self._job_lock_count = 0
        self._job_lock_guard = asyncio.Lock()
        self.reaper_ready_to_finish = asyncio.Event()
        self.checkpoint_contending = asyncio.Event()
        self.allow_reaper_finish = asyncio.Event()
        self.backend_pids: set[int] = set()

    async def get_job_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobRecord | None:
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))
        async with self._job_lock_guard:
            self._job_lock_count += 1
            if self._job_lock_count == 2:
                self.checkpoint_contending.set()
        return await super().get_job_for_update(job_id=job_id, conn=conn)

    async def finish_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        status: JobAttemptStatus,
        completed_at: datetime,
        failure: BackgroundJobFailure | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        self.reaper_ready_to_finish.set()
        await self.allow_reaper_finish.wait()
        await super().finish_attempt(
            attempt=attempt,
            status=status,
            completed_at=completed_at,
            failure=failure,
            conn=conn,
        )


@dataclass(frozen=True, slots=True)
class ReaperSubject:
    job: BackgroundJobRecord
    dispatch: JobDispatchOutboxRecord
    attempt: JobAttemptRecord


def _build_reaper(
    repository: JobExecutionRepository,
) -> tuple[BackgroundJobLeaseReaperService, JobTypeDefinition]:
    settings = get_settings()
    definition = build_builtin_job_type_registry(settings).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    return (
        BackgroundJobLeaseReaperService(
            settings,
            repository=repository,
            retry_jitter=lambda: 0.5,
        ),
        definition,
    )


def _build_execution_service(repository: JobExecutionRepository) -> BackgroundJobExecutionService:
    settings = get_settings()
    definition = build_builtin_job_type_registry(settings).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    job_types = JobTypeRegistry((definition,), strict_contracts=True)
    executions = JobExecutionRegistry(
        job_types=job_types,
        registrations=[
            JobTypeRegistration.from_definition(
                definition=definition,
                handler_factory=NoopThumbnailHandler,
            )
        ],
    )
    return BackgroundJobExecutionService(
        settings,
        repository=repository,
        job_types=job_types,
        executions=executions,
    )


async def _database_time(repository: BackgroundJobRepository) -> datetime:
    async with in_transaction() as conn:
        return await repository.get_database_time(conn=conn)


async def _wait_until_database_time_passes(
    repository: BackgroundJobRepository,
    deadline: datetime,
) -> None:
    while await _database_time(repository) <= deadline:
        await asyncio.sleep(0.02)


async def _create_subject(
    definition: JobTypeDefinition,
    *,
    lease_until: datetime,
    attempt_number: int = 1,
    attempt_status: JobAttemptStatus = JobAttemptStatus.RUNNING,
    record_seed: int | None = None,
    attempt_created_at: datetime | None = None,
) -> ReaperSubject:
    workspace_id = uuid4()
    project_id = uuid4()
    asset_id = uuid4()
    identity = uuid4().hex if record_seed is None else f"seed-{record_seed}"
    claimed_at = lease_until - timedelta(minutes=5)
    target = AssetThumbnailJobTarget(
        workspace_id=workspace_id,
        project_id=project_id,
        entity_id=asset_id,
    )
    input_reference = AssetThumbnailJobInput(
        asset_id=asset_id,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
    )
    job = await BackgroundJobRecord.create(
        id=UUID(int=record_seed * 10 + 1) if record_seed is not None else uuid4(),
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        internal_status=JobInternalStatus.RUNNING,
        retry_class=definition.retry_class,
        authority_mode=definition.authority_mode,
        workspace_id=workspace_id,
        project_id=project_id,
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        idempotency_scope_key=f"reaper-integration:{identity}",
        idempotency_key_hash=hash_json({"idempotency": identity}),
        request_fingerprint=hash_json({"request": identity}),
        source_revision=hash_json({"source": identity}),
        correlation_id=f"reaper-integration-{identity}",
        phase=definition.initial_phase,
        status_key=definition.initial_status_key,
        attempt_count=attempt_number,
        retry_policy=definition.retry_policy.model_dump(mode="json", by_alias=True),
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
        started_at=claimed_at,
    )
    envelope = build_job_dispatch_envelope(job=job, dispatch_sequence=attempt_number)
    serialized_envelope = envelope.model_dump(mode="json", by_alias=True)
    dispatch = await JobDispatchOutboxRecord.create(
        id=UUID(int=record_seed * 10 + 2) if record_seed is not None else uuid4(),
        job_id=job.id,
        dispatch_sequence=attempt_number,
        task_name=job.task_name,
        message_schema_version=envelope.message_schema_version,
        envelope=serialized_envelope,
        envelope_hash=hash_json(serialized_envelope),
        status=JobDispatchStatus.DISPATCHED,
        workload_class=job.workload_class,
        available_at=claimed_at,
        dispatched_at=claimed_at,
        task_message_id=f"message-{identity}",
    )
    attempt = await JobAttemptRecord.create(
        id=UUID(int=record_seed * 10 + 3) if record_seed is not None else uuid4(),
        job_id=job.id,
        dispatch_id=dispatch.id,
        attempt_number=attempt_number,
        fencing_token=uuid4(),
        status=attempt_status,
        worker_id=f"worker-{identity}",
        handler_version=job.job_type_version,
        claimed_at=claimed_at,
        lease_until=lease_until,
        heartbeat_at=claimed_at,
        timeout_at=lease_until + timedelta(minutes=10),
        started_at=claimed_at,
        completed_at=claimed_at if attempt_status == JobAttemptStatus.LEASE_EXPIRED else None,
    )
    if attempt_created_at is not None:
        await JobAttemptRecord.filter(id=attempt.id).update(created_at=attempt_created_at)
    return ReaperSubject(job=job, dispatch=dispatch, attempt=attempt)


async def _cancel_pending(tasks: list[asyncio.Task[Any]]) -> None:
    pending = [task for task in tasks if not task.done()]
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)


async def test_concurrent_reapers_reap_one_generation_and_create_one_retry_dispatch(db_schema) -> None:
    _ = db_schema
    repository = CandidateBarrierRepository()
    first_reaper, definition = _build_reaper(repository)
    second_reaper, _ = _build_reaper(repository)
    database_now = await _database_time(repository)
    subject = await _create_subject(
        definition,
        lease_until=database_now - timedelta(seconds=1),
    )
    tasks = [
        asyncio.create_task(first_reaper.reap_expired_attempts(limit=1)),
        asyncio.create_task(second_reaper.reap_expired_attempts(limit=1)),
    ]

    try:
        batches = await asyncio.wait_for(
            asyncio.gather(*tasks),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
    finally:
        repository.all_candidates_read.set()
        await _cancel_pending(tasks)

    persisted_job = await BackgroundJobRecord.get(id=subject.job.id)
    persisted_attempt = await JobAttemptRecord.get(id=subject.attempt.id)
    expired_attempt_count = await JobAttemptRecord.filter(
        job_id=subject.job.id,
        status=JobAttemptStatus.LEASE_EXPIRED,
    ).count()
    dispatches = await JobDispatchOutboxRecord.filter(job_id=subject.job.id).order_by("dispatch_sequence")
    assert len(repository.backend_pids) == 2
    assert [batch.scanned_count for batch in batches] == [1, 1]
    assert sum(batch.reaped_count for batch in batches) == 1
    assert expired_attempt_count == 1
    assert persisted_attempt.status == JobAttemptStatus.LEASE_EXPIRED
    assert persisted_attempt.error_code == WORKER_LOST_ERROR_CODE
    assert persisted_job.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert [dispatch.dispatch_sequence for dispatch in dispatches] == [1, 2]
    assert dispatches[1].status == JobDispatchStatus.PENDING
    assert dispatches[1].envelope["dispatchSequence"] == 2


async def test_exact_reaper_replays_batch_winner_and_creates_one_retry_dispatch(db_schema) -> None:
    _ = db_schema
    repository = ReaperWinsRepository()
    batch_reaper, definition = _build_reaper(repository)
    exact_reaper, _ = _build_reaper(repository)
    database_now = await _database_time(repository)
    subject = await _create_subject(
        definition,
        lease_until=database_now - timedelta(seconds=1),
    )
    batch_task = asyncio.create_task(batch_reaper.reap_expired_attempts(limit=1))
    exact_task: asyncio.Task | None = None

    try:
        await asyncio.wait_for(
            repository.reaper_ready_to_finish.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        exact_task = asyncio.create_task(
            exact_reaper.reap_exact(
                job_id=subject.job.id,
                attempt_id=subject.attempt.id,
            )
        )
        await asyncio.wait_for(
            repository.checkpoint_contending.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        repository.allow_reaper_finish.set()
        batch, exact = await asyncio.wait_for(
            asyncio.gather(batch_task, exact_task),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
    finally:
        repository.allow_reaper_finish.set()
        tasks: list[asyncio.Task[Any]] = [batch_task]
        if exact_task is not None:
            tasks.append(exact_task)
        await _cancel_pending(tasks)

    persisted_job = await BackgroundJobRecord.get(id=subject.job.id)
    persisted_attempt = await JobAttemptRecord.get(id=subject.attempt.id)
    dispatches = await JobDispatchOutboxRecord.filter(job_id=subject.job.id).order_by("dispatch_sequence")
    assert len(repository.backend_pids) == 2
    assert batch.reaped_count == 1
    assert exact.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert exact.retry_at == persisted_job.next_attempt_at
    assert exact.is_replay is True
    assert persisted_attempt.status == JobAttemptStatus.LEASE_EXPIRED
    assert [dispatch.dispatch_sequence for dispatch in dispatches] == [1, 2]


async def test_exact_reaper_rejects_live_or_foreign_attempts(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    reaper, definition = _build_reaper(repository)
    database_now = await _database_time(repository)
    live_subject = await _create_subject(
        definition,
        lease_until=database_now + timedelta(minutes=5),
    )
    foreign_subject = await _create_subject(
        definition,
        lease_until=database_now - timedelta(seconds=1),
    )

    with pytest.raises(JobLeaseReaperInvariantError, match="has not expired"):
        await reaper.reap_exact(
            job_id=live_subject.job.id,
            attempt_id=live_subject.attempt.id,
        )
    with pytest.raises(JobLeaseReaperInvariantError, match="identity does not match"):
        await reaper.reap_exact(
            job_id=live_subject.job.id,
            attempt_id=foreign_subject.attempt.id,
        )

    persisted_live_attempt = await JobAttemptRecord.get(id=live_subject.attempt.id)
    persisted_foreign_attempt = await JobAttemptRecord.get(id=foreign_subject.attempt.id)
    assert persisted_live_attempt.status == JobAttemptStatus.RUNNING
    assert persisted_foreign_attempt.status == JobAttemptStatus.RUNNING
    assert await JobDispatchOutboxRecord.filter(job_id=live_subject.job.id).count() == 1
    assert await JobDispatchOutboxRecord.filter(job_id=foreign_subject.job.id).count() == 1


async def test_checkpoint_renewal_wins_before_exact_reaper_revalidation(db_schema) -> None:
    _ = db_schema
    repository = ExactAfterCheckpointRepository()
    reaper, definition = _build_reaper(repository)
    execution = _build_execution_service(repository)
    database_now = await _database_time(repository)
    original_lease_until = database_now + timedelta(seconds=2)
    subject = await _create_subject(definition, lease_until=original_lease_until)
    lease = to_execution_lease(
        job=subject.job,
        attempt=subject.attempt,
        dispatch_sequence=subject.attempt.attempt_number,
    )
    checkpoint_task = asyncio.create_task(execution.checkpoint_execution(lease=lease))
    exact_task: asyncio.Task | None = None

    try:
        await asyncio.wait_for(
            repository.checkpoint_validated.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        await asyncio.wait_for(
            _wait_until_database_time_passes(repository, original_lease_until),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        exact_task = asyncio.create_task(
            reaper.reap_exact(
                job_id=subject.job.id,
                attempt_id=subject.attempt.id,
            )
        )
        await asyncio.wait_for(
            repository.exact_reaper_contending.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        repository.allow_checkpoint_write.set()
        control = await asyncio.wait_for(checkpoint_task, timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        with pytest.raises(JobLeaseReaperInvariantError, match="has not expired"):
            await asyncio.wait_for(exact_task, timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    finally:
        repository.allow_checkpoint_write.set()
        tasks: list[asyncio.Task[Any]] = [checkpoint_task]
        if exact_task is not None:
            tasks.append(exact_task)
        await _cancel_pending(tasks)

    persisted_job = await BackgroundJobRecord.get(id=subject.job.id)
    persisted_attempt = await JobAttemptRecord.get(id=subject.attempt.id)
    assert control.observed_at < original_lease_until
    assert persisted_job.internal_status == JobInternalStatus.RUNNING
    assert persisted_attempt.status == JobAttemptStatus.RUNNING
    assert persisted_attempt.heartbeat_at == control.observed_at
    assert persisted_attempt.lease_until == control.lease_until
    assert await JobDispatchOutboxRecord.filter(job_id=subject.job.id).count() == 1


async def test_checkpoint_commit_after_candidate_scan_renews_before_reaper_revalidation(db_schema) -> None:
    _ = db_schema
    repository = CheckpointWinsRepository()
    reaper, definition = _build_reaper(repository)
    execution = _build_execution_service(repository)
    database_now = await _database_time(repository)
    original_lease_until = database_now + timedelta(seconds=2)
    subject = await _create_subject(definition, lease_until=original_lease_until)
    lease = to_execution_lease(
        job=subject.job,
        attempt=subject.attempt,
        dispatch_sequence=subject.attempt.attempt_number,
    )
    checkpoint_task = asyncio.create_task(execution.checkpoint_execution(lease=lease))
    reaper_task: asyncio.Task | None = None

    try:
        await asyncio.wait_for(
            repository.checkpoint_validated.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        await asyncio.wait_for(
            _wait_until_database_time_passes(repository, original_lease_until),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        reaper_task = asyncio.create_task(reaper.reap_expired_attempts(limit=1))
        await asyncio.wait_for(
            repository.candidate_selected.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        repository.allow_checkpoint_write.set()
        control, batch = await asyncio.wait_for(
            asyncio.gather(checkpoint_task, reaper_task),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
    finally:
        repository.allow_checkpoint_write.set()
        tasks: list[asyncio.Task[Any]] = [checkpoint_task]
        if reaper_task is not None:
            tasks.append(reaper_task)
        await _cancel_pending(tasks)

    persisted_job = await BackgroundJobRecord.get(id=subject.job.id)
    persisted_attempt = await JobAttemptRecord.get(id=subject.attempt.id)
    assert control.observed_at < original_lease_until
    assert repository.candidate_time is not None
    assert repository.candidate_time >= original_lease_until
    assert batch.scanned_count == 1
    assert batch.reaped_count == 0
    assert persisted_job.internal_status == JobInternalStatus.RUNNING
    assert persisted_attempt.status == JobAttemptStatus.RUNNING
    assert persisted_attempt.heartbeat_at == control.observed_at
    assert persisted_attempt.lease_until == control.lease_until


async def test_reaper_winning_lock_race_fences_out_checkpoint_without_restoring_attempt(db_schema) -> None:
    _ = db_schema
    repository = ReaperWinsRepository()
    reaper, definition = _build_reaper(repository)
    execution = _build_execution_service(repository)
    database_now = await _database_time(repository)
    subject = await _create_subject(
        definition,
        lease_until=database_now - timedelta(seconds=1),
    )
    original_heartbeat_at = subject.attempt.heartbeat_at
    original_lease_until = subject.attempt.lease_until
    lease: JobExecutionLease = to_execution_lease(
        job=subject.job,
        attempt=subject.attempt,
        dispatch_sequence=subject.attempt.attempt_number,
    )
    reaper_task = asyncio.create_task(reaper.reap_expired_attempts(limit=1))
    checkpoint_task: asyncio.Task | None = None

    try:
        await asyncio.wait_for(
            repository.reaper_ready_to_finish.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        checkpoint_task = asyncio.create_task(execution.checkpoint_execution(lease=lease))
        await asyncio.wait_for(
            repository.checkpoint_contending.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        repository.allow_reaper_finish.set()
        batch = await asyncio.wait_for(reaper_task, timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        with pytest.raises(JobExecutionLeaseLostError):
            await asyncio.wait_for(checkpoint_task, timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    finally:
        repository.allow_reaper_finish.set()
        tasks: list[asyncio.Task[Any]] = [reaper_task]
        if checkpoint_task is not None:
            tasks.append(checkpoint_task)
        await _cancel_pending(tasks)

    persisted_job = await BackgroundJobRecord.get(id=subject.job.id)
    persisted_attempt = await JobAttemptRecord.get(id=subject.attempt.id)
    assert len(repository.backend_pids) == 2
    assert batch.reaped_count == 1
    assert persisted_job.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert persisted_attempt.status == JobAttemptStatus.LEASE_EXPIRED
    assert persisted_attempt.heartbeat_at == original_heartbeat_at
    assert persisted_attempt.lease_until == original_lease_until


async def test_expired_exhausted_attempt_is_dead_lettered_without_new_dispatch(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    reaper, definition = _build_reaper(repository)
    database_now = await _database_time(repository)
    exhausted_attempt_number = definition.retry_policy.max_attempts
    subject = await _create_subject(
        definition,
        lease_until=database_now - timedelta(seconds=1),
        attempt_number=exhausted_attempt_number,
    )

    batch = await reaper.reap_expired_attempts(limit=1)

    persisted_job = await BackgroundJobRecord.get(id=subject.job.id)
    persisted_attempt = await JobAttemptRecord.get(id=subject.attempt.id)
    dispatches = await JobDispatchOutboxRecord.filter(job_id=subject.job.id).order_by("dispatch_sequence")
    assert batch.scanned_count == batch.reaped_count == batch.dead_lettered_count == 1
    assert persisted_job.internal_status == JobInternalStatus.DEAD_LETTERED
    assert persisted_job.completed_at is not None
    assert persisted_job.next_attempt_at is None
    assert persisted_job.error_code == WORKER_LOST_ERROR_CODE
    assert persisted_attempt.status == JobAttemptStatus.LEASE_EXPIRED
    assert persisted_attempt.completed_at == persisted_job.completed_at
    assert [dispatch.dispatch_sequence for dispatch in dispatches] == [exhausted_attempt_number]


async def test_expired_candidate_scan_is_bounded_and_stable(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    _, definition = _build_reaper(repository)
    database_now = await _database_time(repository)
    expired_at = database_now - timedelta(minutes=1)
    tied_created_at = database_now - timedelta(minutes=2)
    ordered_subjects = [
        await _create_subject(
            definition,
            lease_until=expired_at,
            attempt_status=JobAttemptStatus.CLAIMED,
            record_seed=11,
            attempt_created_at=database_now - timedelta(minutes=3),
        ),
        await _create_subject(
            definition,
            lease_until=expired_at,
            record_seed=12,
            attempt_created_at=tied_created_at,
        ),
        await _create_subject(
            definition,
            lease_until=expired_at,
            record_seed=13,
            attempt_created_at=tied_created_at,
        ),
    ]
    await _create_subject(
        definition,
        lease_until=database_now + timedelta(minutes=10),
        record_seed=14,
        attempt_created_at=database_now - timedelta(minutes=4),
    )
    await _create_subject(
        definition,
        lease_until=expired_at,
        attempt_status=JobAttemptStatus.LEASE_EXPIRED,
        record_seed=15,
        attempt_created_at=database_now - timedelta(minutes=4),
    )

    async with in_transaction() as conn:
        first_page = await repository.list_expired_attempt_candidates(
            now=database_now,
            limit=2,
            conn=conn,
        )
        repeated_page = await repository.list_expired_attempt_candidates(
            now=database_now,
            limit=2,
            conn=conn,
        )
        full_scan = await repository.list_expired_attempt_candidates(
            now=database_now,
            limit=10,
            conn=conn,
        )

    expected_ids = [subject.attempt.id for subject in ordered_subjects]
    assert [candidate.attempt_id for candidate in first_page] == expected_ids[:2]
    assert [candidate.attempt_id for candidate in repeated_page] == expected_ids[:2]
    assert [candidate.attempt_id for candidate in full_scan] == expected_ids
