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
from src.core.exceptions import BadRequest
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobFailureClassification,
    JobInternalStatus,
)
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.reaper_schema import JobLeaseReapCandidate
from src.modules.jobs.reaper_service import (
    BackgroundJobLeaseReaperService,
    JobLeaseReaperInvariantError,
)
from src.modules.jobs.schema import BackgroundJobFailure, JobDispatchEnvelope

pytestmark = pytest.mark.unit

NOW = datetime(2026, 7, 15, 10, tzinfo=UTC)


class FakeReaperRepository:
    def __init__(
        self,
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
    ) -> None:
        self.job = job
        self.attempt: JobAttemptRecord | None = attempt
        self.database_time = NOW + timedelta(seconds=120)
        self.dispatches: list[JobDispatchOutboxRecord] = []
        self.unbound_attempt_lock_calls = 0
        self.candidates = [
            JobLeaseReapCandidate(
                job_id=job.id,
                attempt_id=attempt.id,
                lease_until=attempt.lease_until,
            )
        ]

    async def get_database_time(self, *, conn: BaseDBAsyncClient) -> datetime:
        _ = conn
        return self.database_time

    async def list_expired_attempt_candidates(
        self,
        *,
        now: datetime,
        limit: int,
        conn: BaseDBAsyncClient,
    ) -> list[JobLeaseReapCandidate]:
        _ = (now, conn)
        return self.candidates[:limit]

    async def get_job_for_update(self, *, job_id: UUID, conn: BaseDBAsyncClient):
        _ = conn
        return self.job if self.job.id == job_id else None

    async def get_attempt_for_update(self, *, attempt_id: UUID, conn: BaseDBAsyncClient):
        _ = conn
        self.unbound_attempt_lock_calls += 1
        return self.attempt if self.attempt is not None and self.attempt.id == attempt_id else None

    async def get_job_attempt_for_update(
        self,
        *,
        job_id: UUID,
        attempt_id: UUID,
        conn: BaseDBAsyncClient,
    ):
        _ = conn
        if self.attempt is None:
            return None
        if self.attempt.id != attempt_id or self.attempt.job_id != job_id:
            return None
        return self.attempt

    async def get_job_dispatch(
        self,
        *,
        job_id: UUID,
        dispatch_sequence: int,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord | None:
        _ = conn
        return next(
            (
                dispatch
                for dispatch in self.dispatches
                if dispatch.job_id == job_id and dispatch.dispatch_sequence == dispatch_sequence
            ),
            None,
        )

    async def finish_attempt(
        self,
        *,
        attempt: JobAttemptRecord,
        status: JobAttemptStatus,
        completed_at: datetime,
        failure: BackgroundJobFailure | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = conn
        attempt.status = status
        attempt.completed_at = completed_at
        attempt.result_reference = None
        attempt.error_code = failure.error_code if failure is not None else None
        cast(Any, attempt).error_message = failure.error_message if failure is not None else None
        attempt.error_metadata = failure.error_metadata if failure is not None else None
        attempt.failure_classification = failure.failure_classification if failure is not None else None
        attempt.retry_decision = failure.retry_decision if failure is not None else None
        attempt.retry_at = failure.retry_at if failure is not None else None
        attempt.retry_schedule_source = failure.retry_schedule_source if failure is not None else None
        attempt.retry_delay_seconds = failure.retry_delay_seconds if failure is not None else None
        attempt.retry_hint_rejection_reason = failure.retry_hint_rejection_reason if failure is not None else None

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


class FakeTransactionLeaseReaperService(BackgroundJobLeaseReaperService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[BaseDBAsyncClient]:
        if conn is not None:
            yield conn
            return
        yield cast(BaseDBAsyncClient, SimpleNamespace())


def _subject(
    *,
    attempt_number: int = 1,
    attempt_status: JobAttemptStatus = JobAttemptStatus.RUNNING,
) -> tuple[FakeTransactionLeaseReaperService, FakeReaperRepository]:
    settings = Settings(app_env="test", database={"enabled": False})
    definition = build_builtin_job_type_registry(settings).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    job = BackgroundJobRecord(
        id=uuid4(),
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        internal_status=JobInternalStatus.RUNNING,
        retry_class=definition.retry_class,
        target_descriptor={"assetId": str(uuid4())},
        request_fingerprint="a" * 64,
        retry_policy=definition.retry_policy.model_dump(mode="json", by_alias=True),
        attempt_count=attempt_number,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
    )
    attempt = JobAttemptRecord(
        id=uuid4(),
        job_id=job.id,
        dispatch_id=uuid4(),
        attempt_number=attempt_number,
        fencing_token=uuid4(),
        status=attempt_status,
        worker_id="asset-worker-1",
        handler_version=job.job_type_version,
        claimed_at=NOW,
        lease_until=NOW + timedelta(seconds=90),
        heartbeat_at=NOW,
        timeout_at=NOW + timedelta(minutes=10),
        started_at=NOW,
    )
    cast(Any, attempt).job_id = job.id
    repository = FakeReaperRepository(job=job, attempt=attempt)
    service = FakeTransactionLeaseReaperService(
        settings,
        repository=cast(JobExecutionRepository, repository),
        retry_jitter=lambda: 0.5,
    )
    return service, repository


@pytest.mark.asyncio
async def test_reaper_rejects_non_positive_batch_size() -> None:
    service, _ = _subject()

    with pytest.raises(BadRequest) as exc_info:
        await service.reap_expired_attempts(limit=0)

    assert exc_info.value.error == "BACKGROUND_JOB_REAP_LIMIT_INVALID"


@pytest.mark.asyncio
async def test_expired_attempt_is_reaped_once_and_schedules_next_dispatch() -> None:
    service, repository = _subject()

    batch = await service.reap_expired_attempts(limit=10)

    assert batch.scanned_count == batch.reaped_count == 1
    assert batch.retry_scheduled_count == 1
    assert repository.attempt is not None
    assert repository.attempt.status == JobAttemptStatus.LEASE_EXPIRED
    assert repository.job.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert len(repository.dispatches) == 1
    assert repository.dispatches[0].dispatch_sequence == 2
    assert repository.dispatches[0].envelope_hash == hash_json(repository.dispatches[0].envelope)

    repeated = await service.reap_expired_attempts(limit=10)
    assert repeated.scanned_count == 1
    assert repeated.reaped_count == 0
    assert len(repository.dispatches) == 1


@pytest.mark.asyncio
async def test_exact_reaper_returns_fresh_then_proven_replay_outcome() -> None:
    service, repository = _subject()
    assert repository.attempt is not None

    fresh = await service.reap_exact(
        job_id=repository.job.id,
        attempt_id=repository.attempt.id,
    )
    replay = await service.reap_exact(
        job_id=repository.job.id,
        attempt_id=repository.attempt.id,
    )

    assert fresh.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert fresh.retry_at == repository.job.next_attempt_at
    assert fresh.is_replay is False
    assert replay.model_copy(update={"is_replay": False}) == fresh
    assert replay.is_replay is True
    assert repository.attempt.failure_classification == JobFailureClassification.WORKER_LOST
    assert len(repository.dispatches) == 1


@pytest.mark.asyncio
async def test_exact_reaper_replays_exhausted_dead_letter_outcome() -> None:
    service, repository = _subject(attempt_number=3)
    assert repository.attempt is not None

    fresh = await service.reap_exact(
        job_id=repository.job.id,
        attempt_id=repository.attempt.id,
    )
    replay = await service.reap_exact(
        job_id=repository.job.id,
        attempt_id=repository.attempt.id,
    )

    assert fresh.internal_status == JobInternalStatus.DEAD_LETTERED
    assert fresh.retry_at is None
    assert fresh.is_replay is False
    assert replay.model_copy(update={"is_replay": False}) == fresh
    assert replay.is_replay is True
    assert repository.dispatches == []


@pytest.mark.asyncio
async def test_exact_reaper_rejects_attempt_that_has_not_expired() -> None:
    service, repository = _subject()
    assert repository.attempt is not None
    repository.attempt.lease_until = repository.database_time + timedelta(seconds=1)

    with pytest.raises(JobLeaseReaperInvariantError, match="has not expired"):
        await service.reap_exact(
            job_id=repository.job.id,
            attempt_id=repository.attempt.id,
        )

    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.attempt.status == JobAttemptStatus.RUNNING
    assert repository.dispatches == []
    assert repository.unbound_attempt_lock_calls == 0


@pytest.mark.asyncio
async def test_exact_reaper_rejects_missing_or_drifted_retry_outbox() -> None:
    service, repository = _subject()
    assert repository.attempt is not None
    await service.reap_exact(
        job_id=repository.job.id,
        attempt_id=repository.attempt.id,
    )
    dispatch = repository.dispatches.pop()

    with pytest.raises(JobLeaseReaperInvariantError, match="retry outbox"):
        await service.reap_exact(
            job_id=repository.job.id,
            attempt_id=repository.attempt.id,
        )

    dispatch.available_at += timedelta(seconds=1)
    repository.dispatches.append(dispatch)
    with pytest.raises(JobLeaseReaperInvariantError, match="retry outbox"):
        await service.reap_exact(
            job_id=repository.job.id,
            attempt_id=repository.attempt.id,
        )


@pytest.mark.asyncio
async def test_exact_reaper_rejects_attempt_owned_by_another_job() -> None:
    service, repository = _subject()
    assert repository.attempt is not None
    cast(Any, repository.attempt).job_id = uuid4()

    with pytest.raises(JobLeaseReaperInvariantError, match="identity does not match"):
        await service.reap_exact(
            job_id=repository.job.id,
            attempt_id=repository.attempt.id,
        )

    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.attempt.status == JobAttemptStatus.RUNNING
    assert repository.dispatches == []
    assert repository.unbound_attempt_lock_calls == 0


@pytest.mark.asyncio
async def test_exact_reaper_rejects_unproven_replay_evidence() -> None:
    service, repository = _subject()
    assert repository.attempt is not None
    repository.job.internal_status = JobInternalStatus.RETRY_SCHEDULED
    repository.attempt.status = JobAttemptStatus.LEASE_EXPIRED

    with pytest.raises(JobLeaseReaperInvariantError, match="worker-loss evidence"):
        await service.reap_exact(
            job_id=repository.job.id,
            attempt_id=repository.attempt.id,
        )


@pytest.mark.asyncio
async def test_claimed_attempt_is_an_active_reap_candidate() -> None:
    service, repository = _subject(attempt_status=JobAttemptStatus.CLAIMED)

    batch = await service.reap_expired_attempts(limit=1)

    assert batch.reaped_count == 1
    assert repository.attempt is not None
    assert repository.attempt.status == JobAttemptStatus.LEASE_EXPIRED


@pytest.mark.asyncio
async def test_exhausted_worker_loss_dead_letters_without_new_dispatch() -> None:
    service, repository = _subject(attempt_number=3)

    batch = await service.reap_expired_attempts(limit=1)

    assert batch.dead_lettered_count == 1
    assert repository.job.internal_status == JobInternalStatus.DEAD_LETTERED
    assert repository.job.completed_at == repository.database_time
    assert repository.dispatches == []


@pytest.mark.asyncio
async def test_locked_revalidation_skips_attempt_renewed_after_candidate_scan() -> None:
    service, repository = _subject()
    assert repository.attempt is not None
    repository.attempt.lease_until = repository.database_time + timedelta(seconds=1)

    batch = await service.reap_expired_attempts(limit=1)

    assert batch.scanned_count == 1
    assert batch.reaped_count == 0
    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.attempt.status == JobAttemptStatus.RUNNING


@pytest.mark.asyncio
async def test_running_job_with_missing_candidate_attempt_exposes_invariant() -> None:
    service, repository = _subject()
    repository.attempt = None

    with pytest.raises(JobLeaseReaperInvariantError, match="missing expiration candidate"):
        await service.reap_expired_attempts(limit=1)


@pytest.mark.asyncio
async def test_generation_mismatch_exposes_invariant_without_state_change() -> None:
    service, repository = _subject()
    repository.job.attempt_count = 2

    with pytest.raises(JobLeaseReaperInvariantError, match="current generation differs"):
        await service.reap_expired_attempts(limit=1)

    assert repository.job.internal_status == JobInternalStatus.RUNNING
    assert repository.attempt is not None
    assert repository.attempt.status == JobAttemptStatus.RUNNING
