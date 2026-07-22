from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from asyncpg import LockNotAvailableError
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobFailureClassification,
    JobInternalStatus,
    JobRetryDecision,
    JobRetryScheduleSource,
)
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
)
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.dispatch_service import JobDispatchService
from src.modules.jobs.execution_errors import (
    JobExecutionLeaseLostError,
    JobExecutionResultContractError,
    TransientJobExecutionError,
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
    JobExecutionLease,
    JobSuccessCancellationDisposition,
)
from src.modules.jobs.execution_service import BackgroundJobExecutionService
from src.modules.jobs.execution_terminal_service import BackgroundJobTerminalService
from src.modules.jobs.execution_validation import to_execution_lease
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.registry import JobTypeDefinition
from src.modules.jobs.repository import (
    ActiveJobAttemptInvariantError,
    BackgroundJobRepository,
)
from src.modules.jobs.schema import JobDispatchEnvelope, JobDispatchPolicy

pytestmark = pytest.mark.integration

RECEIVED_AT = datetime(2026, 7, 15, 12, tzinfo=UTC)
LOCK_PROBE_TIMEOUT_SECONDS = 5.0
TRANSPORT_MESSAGE_ID = "exact-taskiq-message"


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
        raise AssertionError("delivery acceptance must not invoke the domain handler")

    async def cancel(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> None:
        _ = context


class CoordinatedExecutionRepository(BackgroundJobRepository):
    """Hold the first dispatch row lock until both deliveries entered PostgreSQL."""

    def __init__(self) -> None:
        super().__init__()
        self._entry_count = 0
        self._entry_lock = asyncio.Lock()
        self.all_deliveries_entered = asyncio.Event()
        self.first_dispatch_locked = asyncio.Event()
        self.release_first_delivery = asyncio.Event()
        self.backend_pids: set[int] = set()

    async def get_job_dispatch_for_update(
        self,
        *,
        job_id: UUID,
        dispatch_sequence: int,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord | None:
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))
        async with self._entry_lock:
            self._entry_count += 1
            if self._entry_count == 2:
                self.all_deliveries_entered.set()
        await self.all_deliveries_entered.wait()

        dispatch = await super().get_job_dispatch_for_update(
            job_id=job_id,
            dispatch_sequence=dispatch_sequence,
            conn=conn,
        )
        if not self.first_dispatch_locked.is_set():
            self.first_dispatch_locked.set()
            await self.release_first_delivery.wait()
        return dispatch


class CoordinatedDispatchWorkerRepository(BackgroundJobRepository):
    """Make dispatcher and worker contend for one Dispatch row on separate backends."""

    def __init__(self) -> None:
        super().__init__()
        self._entry_count = 0
        self._entry_lock = asyncio.Lock()
        self.worker_lock_contender = asyncio.Event()
        self.all_lock_contenders_entered = asyncio.Event()
        self.backend_pids: set[int] = set()

    async def _wait_for_lock_contenders(self, *, conn: BaseDBAsyncClient) -> None:
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))
        async with self._entry_lock:
            self._entry_count += 1
            if self._entry_count == 2:
                self.all_lock_contenders_entered.set()
        await self.all_lock_contenders_entered.wait()

    async def get_job_dispatch_for_update(
        self,
        *,
        job_id: UUID,
        dispatch_sequence: int,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord | None:
        self.worker_lock_contender.set()
        await self._wait_for_lock_contenders(conn=conn)
        return await super().get_job_dispatch_for_update(
            job_id=job_id,
            dispatch_sequence=dispatch_sequence,
            conn=conn,
        )

    async def get_dispatch_for_update(
        self,
        *,
        dispatch_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord | None:
        await self._wait_for_lock_contenders(conn=conn)
        return await super().get_dispatch_for_update(dispatch_id=dispatch_id, conn=conn)


class FailingAfterAttemptInsertRepository(BackgroundJobRepository):
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
        await super().create_attempt(
            job=job,
            dispatch=dispatch,
            fencing_token=fencing_token,
            worker_id=worker_id,
            started_at=started_at,
            lease_until=lease_until,
            conn=conn,
        )
        raise RuntimeError("attempt insert failure probe")


class FailingAfterRetryDispatchInsertRepository(BackgroundJobRepository):
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
        raise RuntimeError("retry dispatch insert failure probe")


class FenceRecordingRepository(BackgroundJobRepository):
    def __init__(self) -> None:
        super().__init__()
        self.backend_pids: set[int] = set()
        self.job_lock_requested = asyncio.Event()

    async def get_job_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobRecord | None:
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))
        self.job_lock_requested.set()
        return await super().get_job_for_update(job_id=job_id, conn=conn)


class CoordinatedAcceptedTransport:
    def __init__(self) -> None:
        self.broker_accepted = asyncio.Event()
        self.allow_dispatcher_finalize = asyncio.Event()

    async def dispatch(self, *, task_name: str, envelope: JobDispatchEnvelope) -> str:
        _ = task_name, envelope
        self.broker_accepted.set()
        await self.allow_dispatcher_finalize.wait()
        return TRANSPORT_MESSAGE_ID


def _build_execution_service(
    repository: JobExecutionRepository,
) -> tuple[BackgroundJobExecutionService, JobTypeDefinition]:
    settings = get_settings()
    job_types = build_builtin_job_type_registry(settings)
    definition = job_types.require(job_type="asset.thumbnail.generate", job_type_version=1)
    executions = JobExecutionRegistry(
        job_types=job_types,
        registrations=[
            JobTypeRegistration.from_definition(
                definition=definition,
                handler_factory=NoopThumbnailHandler,
            )
        ],
    )
    return (
        BackgroundJobExecutionService(
            settings,
            repository=repository,
            job_types=job_types,
            executions=executions,
        ),
        definition,
    )


def _build_terminal_service(
    repository: JobExecutionRepository,
    *,
    jitter_ratio: float = 0.5,
) -> tuple[BackgroundJobTerminalService, JobTypeDefinition]:
    execution_service, definition = _build_execution_service(repository)
    return (
        BackgroundJobTerminalService(
            execution_service.settings,
            repository=repository,
            executions=execution_service.executions,
            retry_jitter=lambda: jitter_ratio,
        ),
        definition,
    )


async def _create_job(
    definition: JobTypeDefinition,
    *,
    internal_status: JobInternalStatus = JobInternalStatus.PENDING_DISPATCH,
    attempt_count: int = 0,
) -> BackgroundJobRecord:
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
    token = uuid4().hex
    return await BackgroundJobRecord.create(
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        internal_status=internal_status,
        retry_class=definition.retry_class,
        authority_mode=definition.authority_mode,
        workspace_id=workspace_id,
        project_id=project_id,
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        idempotency_scope_key=f"{workspace_id}:{project_id}:none",
        idempotency_key_hash=hash_json({"idempotency": token}),
        request_fingerprint=hash_json({"request": token}),
        source_revision=hash_json({"source": token}),
        correlation_id=f"execution-repository-{token}",
        phase=definition.initial_phase,
        status_key=definition.initial_status_key,
        attempt_count=attempt_count,
        retry_policy=definition.retry_policy.model_dump(mode="json", by_alias=True),
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
    )


async def _create_dispatch(
    job: BackgroundJobRecord,
    *,
    dispatch_sequence: int,
    status: JobDispatchStatus = JobDispatchStatus.DISPATCHED,
) -> tuple[JobDispatchOutboxRecord, JobDispatchEnvelope]:
    envelope = JobDispatchEnvelope(
        job_id=job.id,
        dispatch_sequence=dispatch_sequence,
        job_type=job.job_type,
        job_type_version=job.job_type_version,
        workload_class=job.workload_class,
        target_descriptor=job.target_descriptor,
        request_fingerprint=job.request_fingerprint,
    )
    serialized_envelope = envelope.model_dump(mode="json", by_alias=True)
    dispatch = await JobDispatchOutboxRecord.create(
        job_id=job.id,
        dispatch_sequence=dispatch_sequence,
        task_name=job.task_name,
        message_schema_version=envelope.message_schema_version,
        envelope=serialized_envelope,
        envelope_hash=hash_json(serialized_envelope),
        status=status,
        workload_class=job.workload_class,
        available_at=RECEIVED_AT,
        dispatch_attempt_count=1,
        dispatcher_id="dispatcher-1" if status == JobDispatchStatus.DISPATCHING else None,
        claim_token=uuid4() if status == JobDispatchStatus.DISPATCHING else None,
        lease_until=RECEIVED_AT + timedelta(minutes=5) if status == JobDispatchStatus.DISPATCHING else None,
        heartbeat_at=RECEIVED_AT if status == JobDispatchStatus.DISPATCHING else None,
        dispatched_at=RECEIVED_AT if status == JobDispatchStatus.DISPATCHED else None,
        task_message_id="existing-message" if status == JobDispatchStatus.DISPATCHED else None,
    )
    return dispatch, envelope


def _delivery_command(
    *,
    job: BackgroundJobRecord,
    envelope: JobDispatchEnvelope,
    worker_id: str,
) -> JobDeliveryCommand:
    return JobDeliveryCommand(
        task_name=job.task_name,
        envelope=envelope,
        worker_id=worker_id,
        transport_message_id=TRANSPORT_MESSAGE_ID,
        received_at=RECEIVED_AT,
    )


async def _database_time(repository: BackgroundJobRepository) -> datetime:
    async with in_transaction() as conn:
        return await repository.get_database_time(conn=conn)


async def _wait_for_postgres_lock_wait(*, backend_pid: int) -> None:
    for _ in range(500):
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict(
                "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
                [backend_pid],
            )
        if rows and rows[0].get("wait_event_type") == "Lock":
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"PostgreSQL backend {backend_pid} never entered a lock wait")


async def _create_attempt(
    *,
    job: BackgroundJobRecord,
    dispatch: JobDispatchOutboxRecord,
    attempt_number: int,
    status: JobAttemptStatus,
    database_time: datetime,
) -> JobAttemptRecord:
    return await JobAttemptRecord.create(
        job_id=job.id,
        dispatch_id=dispatch.id,
        attempt_number=attempt_number,
        fencing_token=uuid4(),
        status=status,
        worker_id=f"worker-{attempt_number}",
        handler_version=job.job_type_version,
        claimed_at=database_time,
        lease_until=database_time + timedelta(minutes=5),
        heartbeat_at=database_time,
        timeout_at=database_time + timedelta(minutes=10),
        started_at=database_time,
    )


async def _create_terminal_subject(
    repository: BackgroundJobRepository,
) -> tuple[
    BackgroundJobTerminalService,
    BackgroundJobRecord,
    JobDispatchOutboxRecord,
    JobAttemptRecord,
    JobExecutionLease,
    AssetThumbnailJobResult,
]:
    service, definition = _build_terminal_service(repository)
    job = await _create_job(
        definition,
        internal_status=JobInternalStatus.RUNNING,
        attempt_count=1,
    )
    dispatch, _ = await _create_dispatch(job, dispatch_sequence=1)
    attempt = await _create_attempt(
        job=job,
        dispatch=dispatch,
        attempt_number=1,
        status=JobAttemptStatus.RUNNING,
        database_time=await _database_time(repository),
    )
    lease = to_execution_lease(job=job, attempt=attempt, dispatch_sequence=1)
    target = AssetThumbnailJobTarget.model_validate(job.target_descriptor)
    assert job.source_revision is not None
    result = AssetThumbnailJobResult(
        asset_id=target.entity_id,
        source_revision=job.source_revision,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        outcome_job_id=job.id,
        produced_widths=(320, 640),
    )
    return service, job, dispatch, attempt, lease, result


async def test_concurrent_exact_deliveries_create_one_attempt_and_return_active_duplicate(db_schema) -> None:
    _ = db_schema
    repository = CoordinatedExecutionRepository()
    service, definition = _build_execution_service(repository)
    job = await _create_job(definition)
    dispatch, envelope = await _create_dispatch(
        job,
        dispatch_sequence=1,
        status=JobDispatchStatus.DISPATCHING,
    )
    deliveries = [
        asyncio.create_task(
            service.accept_delivery(_delivery_command(job=job, envelope=envelope, worker_id=f"worker-{index}"))
        )
        for index in (1, 2)
    ]

    probe_error: Exception | None = None
    try:
        await asyncio.wait_for(repository.first_dispatch_locked.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        assert len(repository.backend_pids) == 2
        assert not any(delivery.done() for delivery in deliveries)
    except Exception as exc:
        probe_error = exc
    finally:
        repository.all_deliveries_entered.set()
        repository.release_first_delivery.set()

    claims = await asyncio.gather(*deliveries)
    if probe_error is not None:
        raise probe_error
    claimed = next(claim for claim in claims if claim.disposition == JobDeliveryDisposition.CLAIMED)
    duplicate = next(claim for claim in claims if claim.disposition == JobDeliveryDisposition.ACTIVE_ATTEMPT_DUPLICATE)

    attempts = await JobAttemptRecord.filter(job_id=job.id).all()
    await job.refresh_from_db()
    await dispatch.refresh_from_db()
    assert claimed.lease is not None
    assert duplicate.active_attempt_id == claimed.lease.attempt_id
    assert [attempt.id for attempt in attempts] == [claimed.lease.attempt_id]
    assert job.attempt_count == 1
    assert job.internal_status == JobInternalStatus.RUNNING
    assert dispatch.status == JobDispatchStatus.DISPATCHED
    assert dispatch.task_message_id == TRANSPORT_MESSAGE_ID


async def test_dispatch_finalize_and_exact_worker_claim_converge_without_deadlock(db_schema) -> None:
    _ = db_schema
    repository = CoordinatedDispatchWorkerRepository()
    execution_service, definition = _build_execution_service(repository)
    dispatch_service = JobDispatchService(
        get_settings(),
        repository=repository,
        event_publisher=None,
    )
    job = await _create_job(definition)
    dispatch, envelope = await _create_dispatch(
        job,
        dispatch_sequence=1,
        status=JobDispatchStatus.DISPATCHING,
    )
    claim_token = dispatch.claim_token
    assert claim_token is not None
    transport = CoordinatedAcceptedTransport()
    policy = JobDispatchPolicy(lease_seconds=30, max_attempts=3, retry_delay_seconds=10)
    dispatcher_task = asyncio.create_task(
        dispatch_service.dispatch_claimed(
            dispatch_id=dispatch.id,
            claim_token=claim_token,
            transport=transport,
            policy=policy,
        )
    )
    worker_task: asyncio.Task | None = None

    try:
        await asyncio.wait_for(transport.broker_accepted.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        worker_task = asyncio.create_task(
            execution_service.accept_delivery(_delivery_command(job=job, envelope=envelope, worker_id="worker-1"))
        )
        await asyncio.wait_for(repository.worker_lock_contender.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        transport.allow_dispatcher_finalize.set()
        await asyncio.wait_for(
            repository.all_lock_contenders_entered.wait(),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
        assert len(repository.backend_pids) == 2
        dispatcher_result, worker_claim = await asyncio.wait_for(
            asyncio.gather(dispatcher_task, worker_task),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
    finally:
        transport.allow_dispatcher_finalize.set()
        repository.all_lock_contenders_entered.set()
        pending_tasks = [task for task in (dispatcher_task, worker_task) if task is not None and not task.done()]
        for task in pending_tasks:
            task.cancel()
        if pending_tasks:
            await asyncio.gather(*pending_tasks, return_exceptions=True)

    persisted_job = await BackgroundJobRecord.get(id=job.id)
    persisted_dispatch = await JobDispatchOutboxRecord.get(id=dispatch.id)
    attempts = await JobAttemptRecord.filter(job_id=job.id).all()
    assert dispatcher_result.status == JobDispatchStatus.DISPATCHED
    assert worker_claim.disposition == JobDeliveryDisposition.CLAIMED
    assert worker_claim.lease is not None
    assert [attempt.id for attempt in attempts] == [worker_claim.lease.attempt_id]
    assert persisted_dispatch.status == JobDispatchStatus.DISPATCHED
    assert persisted_dispatch.task_message_id == TRANSPORT_MESSAGE_ID
    assert persisted_job.internal_status == JobInternalStatus.RUNNING
    assert persisted_job.attempt_count == 1


async def test_attempt_insert_failure_rolls_back_reconciliation_job_and_attempt(db_schema) -> None:
    _ = db_schema
    repository = FailingAfterAttemptInsertRepository()
    service, definition = _build_execution_service(repository)
    job = await _create_job(definition)
    dispatch, envelope = await _create_dispatch(
        job,
        dispatch_sequence=1,
        status=JobDispatchStatus.DISPATCHING,
    )
    original_claim_token = dispatch.claim_token
    assert original_claim_token is not None

    with pytest.raises(RuntimeError, match="attempt insert failure probe"):
        await service.accept_delivery(_delivery_command(job=job, envelope=envelope, worker_id="worker-rollback"))

    persisted_job = await BackgroundJobRecord.get(id=job.id)
    persisted_dispatch = await JobDispatchOutboxRecord.get(id=dispatch.id)
    assert persisted_job.internal_status == JobInternalStatus.PENDING_DISPATCH
    assert persisted_job.attempt_count == 0
    assert persisted_job.started_at is None
    assert persisted_dispatch.status == JobDispatchStatus.DISPATCHING
    assert persisted_dispatch.claim_token == original_claim_token
    assert persisted_dispatch.task_message_id is None
    assert persisted_dispatch.dispatched_at is None
    assert await JobAttemptRecord.filter(job_id=job.id).count() == 0


async def test_expired_active_attempt_requires_reaper_without_granting_a_new_lease(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    service, definition = _build_execution_service(repository)
    job = await _create_job(definition)
    _, envelope = await _create_dispatch(job, dispatch_sequence=1, status=JobDispatchStatus.DISPATCHING)
    first = await service.accept_delivery(_delivery_command(job=job, envelope=envelope, worker_id="worker-1"))
    assert first.lease is not None
    database_time = await _database_time(repository)
    await JobAttemptRecord.filter(id=first.lease.attempt_id).update(lease_until=database_time - timedelta(seconds=1))

    duplicate = await service.accept_delivery(_delivery_command(job=job, envelope=envelope, worker_id="worker-2"))

    assert duplicate.disposition == JobDeliveryDisposition.LEASE_REAP_REQUIRED
    assert duplicate.active_attempt_id == first.lease.attempt_id
    assert duplicate.lease is None
    assert await JobAttemptRecord.filter(job_id=job.id).count() == 1


async def test_claimed_attempt_is_active_and_blocks_a_new_execution_lease(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    service, definition = _build_execution_service(repository)
    job = await _create_job(definition, internal_status=JobInternalStatus.RUNNING, attempt_count=1)
    dispatch, envelope = await _create_dispatch(job, dispatch_sequence=1)
    attempt = await _create_attempt(
        job=job,
        dispatch=dispatch,
        attempt_number=1,
        status=JobAttemptStatus.CLAIMED,
        database_time=await _database_time(repository),
    )

    duplicate = await service.accept_delivery(_delivery_command(job=job, envelope=envelope, worker_id="worker-2"))

    assert duplicate.disposition == JobDeliveryDisposition.ACTIVE_ATTEMPT_DUPLICATE
    assert duplicate.active_attempt_id == attempt.id
    assert await JobAttemptRecord.filter(job_id=job.id).count() == 1


async def test_stale_dispatch_sequence_cannot_replace_the_current_attempt_lease(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    service, definition = _build_execution_service(repository)
    job = await _create_job(definition, internal_status=JobInternalStatus.RUNNING, attempt_count=2)
    _, stale_envelope = await _create_dispatch(job, dispatch_sequence=1)
    current_dispatch, _ = await _create_dispatch(job, dispatch_sequence=2)
    current_attempt = await _create_attempt(
        job=job,
        dispatch=current_dispatch,
        attempt_number=2,
        status=JobAttemptStatus.RUNNING,
        database_time=await _database_time(repository),
    )

    stale = await service.accept_delivery(_delivery_command(job=job, envelope=stale_envelope, worker_id="stale-worker"))

    assert stale.disposition == JobDeliveryDisposition.STALE_DELIVERY
    attempts = await JobAttemptRecord.filter(job_id=job.id).all()
    assert [attempt.id for attempt in attempts] == [current_attempt.id]
    assert attempts[0].fencing_token == current_attempt.fencing_token
    assert attempts[0].worker_id == current_attempt.worker_id


async def test_multiple_active_attempts_raise_explicit_repository_invariant(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    _, definition = _build_execution_service(repository)
    job = await _create_job(definition, internal_status=JobInternalStatus.RUNNING, attempt_count=2)
    first_dispatch, _ = await _create_dispatch(job, dispatch_sequence=1)
    second_dispatch, _ = await _create_dispatch(job, dispatch_sequence=2)
    database_time = await _database_time(repository)
    attempts = [
        await _create_attempt(
            job=job,
            dispatch=dispatch,
            attempt_number=attempt_number,
            status=status,
            database_time=database_time,
        )
        for dispatch, attempt_number, status in (
            (first_dispatch, 1, JobAttemptStatus.CLAIMED),
            (second_dispatch, 2, JobAttemptStatus.RUNNING),
        )
    ]

    with pytest.raises(ActiveJobAttemptInvariantError) as exc_info:
        async with in_transaction() as conn:
            await repository.get_active_attempt_for_update(job_id=job.id, conn=conn)

    assert exc_info.value.job_id == job.id
    assert exc_info.value.attempt_ids == tuple(attempt.id for attempt in attempts)


async def test_database_time_advances_inside_one_postgres_transaction(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()

    async with in_transaction() as conn:
        first = await repository.get_database_time(conn=conn)
        await asyncio.sleep(0.01)
        second = await repository.get_database_time(conn=conn)

    assert first.utcoffset() is not None
    assert second > first


async def test_fenced_domain_commit_holds_public_job_attempt_lock_until_domain_commit_returns(
    db_schema,
) -> None:
    _ = db_schema
    repository = FenceRecordingRepository()
    service, definition = _build_execution_service(repository)
    job = await _create_job(
        definition,
        internal_status=JobInternalStatus.RUNNING,
        attempt_count=1,
    )
    dispatch, _ = await _create_dispatch(job, dispatch_sequence=1)
    attempt = await _create_attempt(
        job=job,
        dispatch=dispatch,
        attempt_number=1,
        status=JobAttemptStatus.RUNNING,
        database_time=await _database_time(repository),
    )
    lease = to_execution_lease(job=job, attempt=attempt, dispatch_sequence=1)
    callback_entered = asyncio.Event()
    allow_domain_commit = asyncio.Event()
    domain_backend_pids: set[int] = set()

    async def domain_commit() -> str:
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
            domain_backend_pids.add(int(rows[0]["pid"]))
            callback_entered.set()
            await allow_domain_commit.wait()
        return "tenant-marker-committed"

    commit_task = asyncio.create_task(service.run_fenced_domain_commit(lease=lease, operation=domain_commit))
    await asyncio.wait_for(callback_entered.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)

    probe_backend_pids: set[int] = set()
    probe_error: Exception | None = None
    try:
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
            probe_backend_pids.add(int(rows[0]["pid"]))
            await conn.execute_query("SET LOCAL lock_timeout = '100ms'")
            with pytest.raises(LockNotAvailableError):
                await BackgroundJobRecord.filter(id=job.id).using_db(conn).select_for_update().first()
    except Exception as exc:
        probe_error = exc
    finally:
        allow_domain_commit.set()

    result, control = await commit_task
    if probe_error is not None:
        raise probe_error
    await attempt.refresh_from_db()
    assert result == "tenant-marker-committed"
    assert control.attempt_id == attempt.id
    assert attempt.lease_until == control.lease_until
    assert domain_backend_pids == repository.backend_pids
    assert probe_backend_pids.isdisjoint(repository.backend_pids)


async def test_new_attempt_generation_wins_public_lock_before_stale_domain_commit(
    db_schema,
) -> None:
    _ = db_schema
    repository = FenceRecordingRepository()
    service, definition = _build_execution_service(repository)
    job = await _create_job(
        definition,
        internal_status=JobInternalStatus.RUNNING,
        attempt_count=1,
    )
    first_dispatch, _ = await _create_dispatch(job, dispatch_sequence=1)
    second_dispatch, second_envelope = await _create_dispatch(job, dispatch_sequence=2)
    first_attempt = await _create_attempt(
        job=job,
        dispatch=first_dispatch,
        attempt_number=1,
        status=JobAttemptStatus.RUNNING,
        database_time=await _database_time(repository),
    )
    stale_lease = to_execution_lease(job=job, attempt=first_attempt, dispatch_sequence=1)
    winner_locked = asyncio.Event()
    release_winner = asyncio.Event()
    winner_backend_pids: set[int] = set()

    async def install_next_generation() -> None:
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
            winner_backend_pids.add(int(rows[0]["pid"]))
            locked_job = await BackgroundJobRecord.filter(id=job.id).using_db(conn).select_for_update().first()
            locked_attempt = (
                await JobAttemptRecord.filter(id=first_attempt.id).using_db(conn).select_for_update().first()
            )
            assert locked_job is not None
            assert locked_attempt is not None
            winner_locked.set()
            await release_winner.wait()
            database_now = await repository.get_database_time(conn=conn)
            await repository.finish_attempt(
                attempt=locked_attempt,
                status=JobAttemptStatus.LEASE_EXPIRED,
                completed_at=database_now,
                failure=None,
                conn=conn,
            )
            await repository.update_job_fields(
                job=locked_job,
                fields={
                    "internal_status": JobInternalStatus.RETRY_SCHEDULED,
                    "next_attempt_at": database_now,
                },
                conn=conn,
            )

    winner_task = asyncio.create_task(install_next_generation())
    await asyncio.wait_for(winner_locked.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    stale_callback_called = False

    async def stale_domain_commit() -> str:
        nonlocal stale_callback_called
        stale_callback_called = True
        return "must-not-commit"

    stale_commit_task = asyncio.create_task(
        service.run_fenced_domain_commit(lease=stale_lease, operation=stale_domain_commit)
    )
    await asyncio.wait_for(repository.job_lock_requested.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    assert len(repository.backend_pids) == 1
    stale_backend_pid = next(iter(repository.backend_pids))
    await _wait_for_postgres_lock_wait(backend_pid=stale_backend_pid)
    assert stale_callback_called is False

    release_winner.set()
    await winner_task
    with pytest.raises(JobExecutionLeaseLostError):
        await stale_commit_task

    await job.refresh_from_db()
    claim = await service.accept_delivery(
        _delivery_command(
            job=job,
            envelope=second_envelope,
            worker_id="replacement-worker",
        )
    )
    assert claim.disposition == JobDeliveryDisposition.CLAIMED
    assert claim.lease is not None
    assert claim.lease.attempt_number == 2
    assert stale_callback_called is False
    assert winner_backend_pids.isdisjoint({stale_backend_pid})
    await second_dispatch.refresh_from_db()
    assert second_dispatch.status == JobDispatchStatus.DISPATCHED


async def test_terminal_success_atomically_persists_typed_result_and_exact_replay(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    service, job, dispatch, attempt, lease, result = await _create_terminal_subject(repository)

    first = await service.complete_success(
        lease=lease,
        result=result,
        cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
    )
    replay = await service.complete_success(
        lease=lease,
        result=result,
        cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
    )

    persisted_job = await BackgroundJobRecord.get(id=job.id)
    persisted_attempt = await JobAttemptRecord.get(id=attempt.id)
    persisted_dispatch = await JobDispatchOutboxRecord.get(id=dispatch.id)
    result_reference = result.model_dump(mode="json", by_alias=True)
    assert first.is_replay is False
    assert replay.is_replay is True
    assert replay.completed_at == first.completed_at
    assert replay.result_reference == first.result_reference == result_reference
    assert persisted_job.internal_status == JobInternalStatus.SUCCEEDED
    assert persisted_job.completed_at == first.completed_at
    assert persisted_job.result_reference == result_reference
    assert persisted_attempt.status == JobAttemptStatus.SUCCEEDED
    assert persisted_attempt.completed_at == first.completed_at
    assert persisted_attempt.result_reference == result_reference
    assert persisted_dispatch.status == JobDispatchStatus.DISPATCHED
    assert await JobDispatchOutboxRecord.filter(job_id=job.id).count() == 1


async def test_terminal_result_semantic_mismatch_cannot_mutate_job_or_attempt(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    service, job, _, attempt, lease, result = await _create_terminal_subject(repository)
    mismatched_result = result.model_copy(update={"source_revision": "f" * 64})

    with pytest.raises(JobExecutionResultContractError):
        await service.complete_success(
            lease=lease,
            result=mismatched_result,
            cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
        )

    persisted_job = await BackgroundJobRecord.get(id=job.id)
    persisted_attempt = await JobAttemptRecord.get(id=attempt.id)
    assert persisted_job.internal_status == JobInternalStatus.RUNNING
    assert persisted_job.completed_at is None
    assert persisted_job.result_reference is None
    assert persisted_attempt.status == JobAttemptStatus.RUNNING
    assert persisted_attempt.completed_at is None
    assert persisted_attempt.result_reference is None


async def test_terminal_transient_failure_atomically_schedules_one_retry_and_replays(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    service, job, _, attempt, lease, _ = await _create_terminal_subject(repository)
    error = TransientJobExecutionError(
        code="BACKGROUND_JOB_WORKER_LOST",
        safe_message="Worker execution lease expired",
    )

    first = await service.complete_failure(lease=lease, error=error)
    replay = await service.complete_failure(lease=lease, error=error)

    persisted_job = await BackgroundJobRecord.get(id=job.id)
    persisted_attempt = await JobAttemptRecord.get(id=attempt.id)
    dispatches = await JobDispatchOutboxRecord.filter(job_id=job.id).order_by("dispatch_sequence")
    assert first.is_replay is False
    assert replay.is_replay is True
    assert replay.next_attempt_at == first.next_attempt_at
    assert persisted_job.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert persisted_job.next_attempt_at == first.next_attempt_at
    assert persisted_job.completed_at is None
    assert persisted_job.error_code == error.code
    assert persisted_job.error_message == error.safe_message
    assert persisted_job.error_metadata == error.metadata
    assert persisted_attempt.status == JobAttemptStatus.FAILED
    assert persisted_attempt.completed_at is not None
    assert persisted_attempt.error_code == error.code
    assert persisted_attempt.error_message == error.safe_message
    assert persisted_attempt.error_metadata == error.metadata
    assert persisted_attempt.failure_classification == JobFailureClassification.TRANSIENT
    assert persisted_attempt.retry_decision == JobRetryDecision.SCHEDULED
    assert persisted_attempt.retry_schedule_source == JobRetryScheduleSource.EXPONENTIAL_FULL_JITTER
    assert persisted_attempt.retry_delay_seconds == 2.5
    assert persisted_attempt.retry_at == first.next_attempt_at
    assert persisted_attempt.retry_hint_rejection_reason is None
    assert [dispatch.dispatch_sequence for dispatch in dispatches] == [1, 2]
    retry_dispatch = dispatches[1]
    assert retry_dispatch.status == JobDispatchStatus.PENDING
    assert retry_dispatch.available_at == first.next_attempt_at
    assert retry_dispatch.envelope["dispatchSequence"] == 2
    assert retry_dispatch.envelope_hash == hash_json(retry_dispatch.envelope)


async def test_terminal_retry_dispatch_insert_failure_rolls_back_entire_projection(db_schema) -> None:
    _ = db_schema
    repository = FailingAfterRetryDispatchInsertRepository()
    service, job, dispatch, attempt, lease, _ = await _create_terminal_subject(repository)
    error = TransientJobExecutionError(
        code="BACKGROUND_JOB_WORKER_LOST",
        safe_message="Worker execution lease expired",
    )

    with pytest.raises(RuntimeError, match="retry dispatch insert failure probe"):
        await service.complete_failure(lease=lease, error=error)

    persisted_job = await BackgroundJobRecord.get(id=job.id)
    persisted_attempt = await JobAttemptRecord.get(id=attempt.id)
    persisted_dispatch = await JobDispatchOutboxRecord.get(id=dispatch.id)
    assert persisted_job.internal_status == JobInternalStatus.RUNNING
    assert persisted_job.next_attempt_at is None
    assert persisted_job.completed_at is None
    assert persisted_job.error_code is None
    assert persisted_job.error_message is None
    assert persisted_job.error_metadata is None
    assert persisted_attempt.status == JobAttemptStatus.RUNNING
    assert persisted_attempt.completed_at is None
    assert persisted_attempt.error_code is None
    assert persisted_attempt.error_message is None
    assert persisted_attempt.error_metadata is None
    assert persisted_dispatch.status == JobDispatchStatus.DISPATCHED
    assert persisted_dispatch.task_message_id == "existing-message"
    assert await JobDispatchOutboxRecord.filter(job_id=job.id).count() == 1


@pytest.mark.parametrize("invalid_fence", ["expired", "stale-token"])
async def test_expired_or_stale_fence_cannot_persist_terminal_state(db_schema, invalid_fence: str) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    service, job, dispatch, attempt, lease, result = await _create_terminal_subject(repository)
    if invalid_fence == "expired":
        database_time = await _database_time(repository)
        await JobAttemptRecord.filter(id=attempt.id).update(lease_until=database_time - timedelta(seconds=1))
    else:
        lease = lease.model_copy(update={"fencing_token": uuid4()})

    with pytest.raises(JobExecutionLeaseLostError):
        await service.complete_success(
            lease=lease,
            result=result,
            cancellation_disposition=JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT,
        )

    persisted_job = await BackgroundJobRecord.get(id=job.id)
    persisted_attempt = await JobAttemptRecord.get(id=attempt.id)
    persisted_dispatch = await JobDispatchOutboxRecord.get(id=dispatch.id)
    assert persisted_job.internal_status == JobInternalStatus.RUNNING
    assert persisted_job.completed_at is None
    assert persisted_job.result_reference is None
    assert persisted_attempt.status == JobAttemptStatus.RUNNING
    assert persisted_attempt.completed_at is None
    assert persisted_attempt.result_reference is None
    assert persisted_dispatch.status == JobDispatchStatus.DISPATCHED
    assert await JobDispatchOutboxRecord.filter(job_id=job.id).count() == 1
