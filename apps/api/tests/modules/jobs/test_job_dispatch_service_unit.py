from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Conflict
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.modules.jobs.dispatch_service import JobDispatchService
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.retry import JobRetryPolicy
from src.modules.jobs.schema import JobDispatchEnvelope, JobDispatchPolicy


class FakeDispatchRepository:
    def __init__(self, *, job: BackgroundJobRecord, dispatch: JobDispatchOutboxRecord) -> None:
        self.job = job
        self.dispatch = dispatch
        self.database_time = dispatch.available_at

    async def get_database_time(self, *, conn) -> datetime:
        _ = conn
        return self.database_time

    async def list_due_dispatches_for_update(self, *, now: datetime, limit: int, conn):
        _ = conn
        pending_or_retry_due = self.dispatch.status in {
            JobDispatchStatus.PENDING,
            JobDispatchStatus.RETRY_SCHEDULED,
        }
        expired_claim = (
            self.dispatch.status == JobDispatchStatus.DISPATCHING
            and self.dispatch.lease_until is not None
            and self.dispatch.lease_until <= now
        )
        if not pending_or_retry_due and not expired_claim:
            return []
        return [self.dispatch][:limit]

    async def claim_dispatch(
        self,
        *,
        dispatch,
        dispatcher_id: str,
        claim_token: UUID,
        claimed_at: datetime,
        lease_until: datetime,
        conn,
    ) -> None:
        _ = conn
        dispatch.status = JobDispatchStatus.DISPATCHING
        dispatch.dispatch_attempt_count += 1
        dispatch.dispatcher_id = dispatcher_id
        dispatch.claim_token = claim_token
        dispatch.heartbeat_at = claimed_at
        dispatch.lease_until = lease_until
        dispatch.next_dispatch_at = None

    async def get_dispatch(self, *, dispatch_id: UUID):
        return self.dispatch if self.dispatch.id == dispatch_id else None

    async def get_dispatch_for_update(self, *, dispatch_id: UUID, conn):
        _ = conn
        return self.dispatch if self.dispatch.id == dispatch_id else None

    async def get_job_for_update(self, *, job_id: UUID, conn):
        _ = conn
        return self.job if self.job.id == job_id else None

    async def mark_dispatch_succeeded(
        self,
        *,
        dispatch,
        task_message_id: str | None,
        dispatched_at: datetime,
        conn,
    ) -> None:
        _ = conn
        dispatch.status = JobDispatchStatus.DISPATCHED
        dispatch.task_message_id = task_message_id
        dispatch.dispatched_at = dispatched_at
        dispatch.claim_token = None

    async def mark_job_queued(self, *, job, conn) -> None:
        _ = conn
        job.internal_status = JobInternalStatus.QUEUED

    async def mark_dispatch_failed(
        self,
        *,
        dispatch,
        error_message: str,
        next_attempt_at: datetime,
        conn,
    ) -> None:
        _ = conn
        dispatch.status = JobDispatchStatus.RETRY_SCHEDULED
        dispatch.last_error = error_message
        dispatch.next_dispatch_at = next_attempt_at
        dispatch.claim_token = None

    async def mark_dispatch_dead_lettered(self, *, dispatch, error_message: str, conn) -> None:
        _ = conn
        dispatch.status = JobDispatchStatus.DEAD_LETTERED
        dispatch.last_error = error_message
        dispatch.claim_token = None

    async def update_job_fields(self, *, job, fields: dict[str, object], conn) -> None:
        _ = conn
        for name, value in fields.items():
            setattr(job, name, value)


class FakeTransactionDispatchService(JobDispatchService):
    @asynccontextmanager
    async def tx(self, *, conn=None) -> AsyncIterator[object]:
        yield conn or object()


class FakeTransport:
    def __init__(self, *, error: Exception | None = None) -> None:
        self.error = error
        self.calls: list[tuple[str, JobDispatchEnvelope]] = []

    async def dispatch(self, *, task_name: str, envelope: JobDispatchEnvelope) -> str:
        self.calls.append((task_name, envelope))
        if self.error is not None:
            raise self.error
        return "task-message-1"


class WorkerReconcilingTransport(FakeTransport):
    def __init__(self, *, job: BackgroundJobRecord, dispatch: JobDispatchOutboxRecord) -> None:
        super().__init__()
        self.job = job
        self.dispatch_record = dispatch

    async def dispatch(self, *, task_name: str, envelope: JobDispatchEnvelope) -> str:
        self.calls.append((task_name, envelope))
        self.dispatch_record.status = JobDispatchStatus.DISPATCHED
        self.dispatch_record.task_message_id = "worker-reconciled-message"
        self.dispatch_record.dispatched_at = self.dispatch_record.available_at
        self.dispatch_record.dispatcher_id = None
        self.dispatch_record.claim_token = None
        self.dispatch_record.lease_until = None
        self.dispatch_record.heartbeat_at = None
        self.job.internal_status = JobInternalStatus.RUNNING
        return "dispatcher-message"


class WorkerReconcilingErrorTransport(WorkerReconcilingTransport):
    async def dispatch(self, *, task_name: str, envelope: JobDispatchEnvelope) -> str:
        await super().dispatch(task_name=task_name, envelope=envelope)
        raise RuntimeError("ambiguous broker outcome")


def create_subject() -> tuple[
    FakeTransactionDispatchService,
    FakeDispatchRepository,
    BackgroundJobRecord,
    JobDispatchOutboxRecord,
]:
    job_id = uuid4()
    job = BackgroundJobRecord(
        id=job_id,
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        task_name="jobs:asset-cpu:asset-thumbnail-generate:v1",
        workload_class=JobWorkloadClass.ASSET_CPU,
        internal_status=JobInternalStatus.PENDING_DISPATCH,
        retry_policy=JobRetryPolicy(
            max_attempts=1,
            initial_delay_seconds=5,
            multiplier=2,
            maximum_delay_seconds=60,
        ).model_dump(mode="json", by_alias=True),
        target_descriptor={"assetId": str(uuid4())},
        request_fingerprint="a" * 64,
    )
    envelope = JobDispatchEnvelope(
        job_id=job_id,
        dispatch_sequence=1,
        job_type=job.job_type,
        job_type_version=job.job_type_version,
        workload_class=job.workload_class,
        target_descriptor=job.target_descriptor,
        request_fingerprint=job.request_fingerprint,
    )
    dispatch = JobDispatchOutboxRecord(
        id=uuid4(),
        job_id=job.id,
        dispatch_sequence=1,
        task_name=job.task_name,
        message_schema_version=1,
        envelope=envelope.model_dump(mode="json", by_alias=True),
        envelope_hash=hash_json(envelope.model_dump(mode="json", by_alias=True)),
        status=JobDispatchStatus.PENDING,
        workload_class=job.workload_class,
        available_at=datetime(2026, 7, 15, 12, tzinfo=UTC),
        dispatch_attempt_count=0,
    )
    cast(Any, dispatch).job_id = job.id
    repository = FakeDispatchRepository(job=job, dispatch=dispatch)
    service = FakeTransactionDispatchService(
        Settings(app_env="test", database={"enabled": False}),
        repository=cast(BackgroundJobRepository, repository),
        event_publisher=None,
    )
    return service, repository, job, dispatch


def dispatch_policy(*, max_attempts: int = 3) -> JobDispatchPolicy:
    return JobDispatchPolicy(lease_seconds=30, max_attempts=max_attempts, retry_delay_seconds=10)


@pytest.mark.asyncio
async def test_claim_due_dispatches_records_dispatch_lease() -> None:
    service, _, _, dispatch = create_subject()

    claimed = await service.claim_due_dispatches(
        dispatcher_id="dispatcher-1",
        limit=10,
        policy=dispatch_policy(),
    )

    assert claimed == [dispatch]
    assert dispatch.status == JobDispatchStatus.DISPATCHING
    assert dispatch.claim_token is not None
    assert dispatch.lease_until is not None
    assert dispatch.dispatch_attempt_count == 1


@pytest.mark.asyncio
async def test_claim_due_dispatches_reclaims_expired_lease_with_same_envelope() -> None:
    service, repository, _, dispatch = create_subject()
    policy = dispatch_policy()
    first_claimed_at = dispatch.available_at
    repository.database_time = first_claimed_at
    await service.claim_due_dispatches(
        dispatcher_id="dispatcher-1",
        limit=1,
        policy=policy,
    )
    first_claim_token = dispatch.claim_token
    envelope_before_reclaim = dict(dispatch.envelope)

    repository.database_time = first_claimed_at + timedelta(seconds=policy.lease_seconds + 1)
    reclaimed = await service.claim_due_dispatches(
        dispatcher_id="dispatcher-2",
        limit=1,
        policy=policy,
    )

    assert reclaimed == [dispatch]
    assert dispatch.dispatch_attempt_count == 2
    assert dispatch.claim_token is not None
    assert dispatch.claim_token != first_claim_token
    assert dispatch.dispatch_sequence == 1
    assert dispatch.envelope == envelope_before_reclaim
    assert dispatch.envelope_hash == hash_json(envelope_before_reclaim)


@pytest.mark.asyncio
async def test_claim_due_dispatches_does_not_reclaim_live_lease() -> None:
    service, repository, _, dispatch = create_subject()
    policy = dispatch_policy()
    first_claimed_at = dispatch.available_at
    repository.database_time = first_claimed_at
    await service.claim_due_dispatches(
        dispatcher_id="dispatcher-1",
        limit=1,
        policy=policy,
    )
    first_claim_token = dispatch.claim_token

    repository.database_time = first_claimed_at + timedelta(seconds=policy.lease_seconds - 1)
    reclaimed = await service.claim_due_dispatches(
        dispatcher_id="dispatcher-2",
        limit=1,
        policy=policy,
    )

    assert reclaimed == []
    assert dispatch.dispatch_attempt_count == 1
    assert dispatch.claim_token == first_claim_token


@pytest.mark.asyncio
async def test_reclaimed_dispatch_republishes_original_sequence_and_envelope() -> None:
    service, repository, _, dispatch = create_subject()
    policy = dispatch_policy()
    first_claimed_at = dispatch.available_at
    repository.database_time = first_claimed_at
    await service.claim_due_dispatches(
        dispatcher_id="dispatcher-1",
        limit=1,
        policy=policy,
    )
    original_envelope = dict(dispatch.envelope)
    repository.database_time = first_claimed_at + timedelta(seconds=policy.lease_seconds + 1)
    await service.claim_due_dispatches(
        dispatcher_id="dispatcher-2",
        limit=1,
        policy=policy,
    )
    reclaim_token = dispatch.claim_token
    assert reclaim_token is not None
    transport = FakeTransport()

    await service.dispatch_claimed(
        dispatch_id=dispatch.id,
        claim_token=reclaim_token,
        transport=transport,
        policy=policy,
    )

    sent_envelope = transport.calls[0][1]
    assert sent_envelope.dispatch_sequence == 1
    assert sent_envelope.model_dump(mode="json", by_alias=True) == original_envelope
    assert dispatch.dispatch_attempt_count == 2


@pytest.mark.asyncio
async def test_expired_claim_at_attempt_limit_dead_letters_without_republish() -> None:
    service, repository, job, dispatch = create_subject()
    policy = dispatch_policy(max_attempts=1)
    first_claimed_at = dispatch.available_at
    repository.database_time = first_claimed_at
    await service.claim_due_dispatches(
        dispatcher_id="dispatcher-1",
        limit=1,
        policy=policy,
    )

    repository.database_time = first_claimed_at + timedelta(seconds=policy.lease_seconds + 1)
    reclaimed = await service.claim_due_dispatches(
        dispatcher_id="dispatcher-2",
        limit=1,
        policy=policy,
    )

    assert reclaimed == []
    assert dispatch.status == JobDispatchStatus.DEAD_LETTERED
    assert dispatch.dispatch_attempt_count == 1
    assert job.internal_status == JobInternalStatus.DEAD_LETTERED
    assert job.error_code == "BACKGROUND_JOB_DISPATCH_EXHAUSTED"


@pytest.mark.asyncio
async def test_dispatch_claimed_marks_outbox_and_job_after_transport_accepts() -> None:
    service, _, job, dispatch = create_subject()
    await service.claim_due_dispatches(dispatcher_id="dispatcher-1", limit=1, policy=dispatch_policy())
    claim_token = dispatch.claim_token
    assert claim_token is not None
    transport = FakeTransport()

    result = await service.dispatch_claimed(
        dispatch_id=dispatch.id,
        claim_token=claim_token,
        transport=transport,
        policy=dispatch_policy(),
    )

    assert result.status == JobDispatchStatus.DISPATCHED
    assert result.dispatch_attempt_count == 1
    assert job.internal_status == JobInternalStatus.QUEUED
    assert transport.calls[0][0] == job.task_name


@pytest.mark.asyncio
async def test_retry_dispatch_claim_transitions_through_pending_before_queued() -> None:
    service, _, job, dispatch = create_subject()
    job.internal_status = JobInternalStatus.RETRY_SCHEDULED
    job.attempt_count = 1
    envelope = JobDispatchEnvelope.model_validate(dispatch.envelope).model_copy(update={"dispatch_sequence": 2})
    dispatch.dispatch_sequence = 2
    dispatch.envelope = envelope.model_dump(mode="json", by_alias=True)
    dispatch.envelope_hash = hash_json(dispatch.envelope)

    await service.claim_due_dispatches(
        dispatcher_id="dispatcher-1",
        limit=1,
        policy=dispatch_policy(),
    )

    assert job.internal_status == JobInternalStatus.PENDING_DISPATCH
    claim_token = dispatch.claim_token
    assert claim_token is not None
    await service.dispatch_claimed(
        dispatch_id=dispatch.id,
        claim_token=claim_token,
        transport=FakeTransport(),
        policy=dispatch_policy(),
    )
    assert job.internal_status == JobInternalStatus.QUEUED


@pytest.mark.asyncio
async def test_dispatch_finalize_accepts_exact_worker_reconciliation_idempotently() -> None:
    service, _, job, dispatch = create_subject()
    await service.claim_due_dispatches(dispatcher_id="dispatcher-1", limit=1, policy=dispatch_policy())
    claim_token = dispatch.claim_token
    assert claim_token is not None

    result = await service.dispatch_claimed(
        dispatch_id=dispatch.id,
        claim_token=claim_token,
        transport=WorkerReconcilingTransport(job=job, dispatch=dispatch),
        policy=dispatch_policy(),
    )

    assert result.status == JobDispatchStatus.DISPATCHED
    assert result.dispatch_attempt_count == 1
    assert result.task_message_id == "worker-reconciled-message"
    assert job.internal_status == JobInternalStatus.RUNNING


@pytest.mark.asyncio
async def test_dispatch_failure_finalize_accepts_exact_worker_reconciliation() -> None:
    service, _, job, dispatch = create_subject()
    await service.claim_due_dispatches(dispatcher_id="dispatcher-1", limit=1, policy=dispatch_policy())
    claim_token = dispatch.claim_token
    assert claim_token is not None

    result = await service.dispatch_claimed(
        dispatch_id=dispatch.id,
        claim_token=claim_token,
        transport=WorkerReconcilingErrorTransport(job=job, dispatch=dispatch),
        policy=dispatch_policy(),
    )

    assert result.status == JobDispatchStatus.DISPATCHED
    assert result.dispatch_attempt_count == 1
    assert result.task_message_id == "worker-reconciled-message"
    assert job.internal_status == JobInternalStatus.RUNNING


@pytest.mark.asyncio
async def test_dispatch_failure_remains_visible_and_retryable() -> None:
    service, _, job, dispatch = create_subject()
    await service.claim_due_dispatches(dispatcher_id="dispatcher-1", limit=1, policy=dispatch_policy())
    claim_token = dispatch.claim_token
    assert claim_token is not None

    with pytest.raises(RuntimeError, match="broker unavailable"):
        await service.dispatch_claimed(
            dispatch_id=dispatch.id,
            claim_token=claim_token,
            transport=FakeTransport(error=RuntimeError("broker unavailable")),
            policy=dispatch_policy(),
        )

    assert dispatch.status == JobDispatchStatus.RETRY_SCHEDULED
    assert dispatch.dispatch_attempt_count == 1
    assert dispatch.last_error == "broker unavailable"
    assert job.internal_status == JobInternalStatus.PENDING_DISPATCH


@pytest.mark.asyncio
async def test_first_dispatch_failure_preserves_second_configured_attempt() -> None:
    service, _, job, dispatch = create_subject()
    policy = dispatch_policy(max_attempts=2)
    await service.claim_due_dispatches(dispatcher_id="dispatcher-1", limit=1, policy=policy)
    claim_token = dispatch.claim_token
    assert claim_token is not None

    with pytest.raises(RuntimeError, match="broker unavailable"):
        await service.dispatch_claimed(
            dispatch_id=dispatch.id,
            claim_token=claim_token,
            transport=FakeTransport(error=RuntimeError("broker unavailable")),
            policy=policy,
        )

    assert dispatch.status == JobDispatchStatus.RETRY_SCHEDULED
    assert dispatch.dispatch_attempt_count == 1
    assert job.internal_status == JobInternalStatus.PENDING_DISPATCH


@pytest.mark.asyncio
async def test_dispatch_failure_dead_letters_after_dispatch_attempt_limit() -> None:
    service, _, job, dispatch = create_subject()
    await service.claim_due_dispatches(dispatcher_id="dispatcher-1", limit=1, policy=dispatch_policy())
    claim_token = dispatch.claim_token
    assert claim_token is not None

    with pytest.raises(RuntimeError, match="broker unavailable"):
        await service.dispatch_claimed(
            dispatch_id=dispatch.id,
            claim_token=claim_token,
            transport=FakeTransport(error=RuntimeError("broker unavailable")),
            policy=dispatch_policy(max_attempts=1),
        )

    assert dispatch.status == JobDispatchStatus.DEAD_LETTERED
    assert dispatch.dispatch_attempt_count == 1
    assert job.internal_status == JobInternalStatus.DEAD_LETTERED
    assert job.error_code == "BACKGROUND_JOB_DISPATCH_EXHAUSTED"


@pytest.mark.asyncio
async def test_dispatch_claim_rejects_stale_token_before_transport_call() -> None:
    service, _, _, dispatch = create_subject()
    await service.claim_due_dispatches(dispatcher_id="dispatcher-1", limit=1, policy=dispatch_policy())
    transport = FakeTransport()

    with pytest.raises(Conflict) as exc_info:
        await service.dispatch_claimed(
            dispatch_id=dispatch.id,
            claim_token=uuid4(),
            transport=transport,
            policy=dispatch_policy(),
        )

    assert exc_info.value.error == "BACKGROUND_JOB_DISPATCH_CLAIM_STALE"
    assert transport.calls == []


@pytest.mark.asyncio
async def test_dispatch_claim_rejects_tampered_envelope_before_transport_call() -> None:
    service, _, _, dispatch = create_subject()
    await service.claim_due_dispatches(dispatcher_id="dispatcher-1", limit=1, policy=dispatch_policy())
    claim_token = dispatch.claim_token
    assert claim_token is not None
    dispatch.envelope = {**dispatch.envelope, "requestFingerprint": "b" * 64}
    transport = FakeTransport()

    with pytest.raises(Conflict) as exc_info:
        await service.dispatch_claimed(
            dispatch_id=dispatch.id,
            claim_token=claim_token,
            transport=transport,
            policy=dispatch_policy(),
        )

    assert exc_info.value.error == "BACKGROUND_JOB_DISPATCH_ENVELOPE_MISMATCH"
    assert transport.calls == []
