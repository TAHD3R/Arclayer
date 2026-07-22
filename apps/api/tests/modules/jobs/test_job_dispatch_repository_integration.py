from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobWorkloadClass,
)
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.retry import JobRetryPolicy

pytestmark = pytest.mark.integration

NOW = datetime(2026, 7, 15, 12, tzinfo=UTC)
LOCK_PROBE_TIMEOUT_SECONDS = 5.0


async def _create_dispatch(
    *,
    sequence: int,
    status: JobDispatchStatus,
    lease_until: datetime | None = None,
    next_dispatch_at: datetime | None = None,
) -> JobDispatchOutboxRecord:
    digest = sha256(f"dispatch-repository-{sequence}".encode()).hexdigest()
    job = await BackgroundJobRecord.create(
        id=UUID(int=100 + sequence),
        job_type="test.dispatch-recovery",
        job_type_version=1,
        task_name="jobs:maintenance:test-dispatch-recovery:v1",
        workload_class=JobWorkloadClass.MAINTENANCE,
        target_descriptor={},
        idempotency_scope_key=f"dispatch-repository:{sequence}",
        idempotency_key_hash=digest,
        request_fingerprint=digest,
        correlation_id=f"dispatch-repository-{sequence}",
        retry_policy=JobRetryPolicy(
            max_attempts=1,
            initial_delay_seconds=5,
            multiplier=2,
            maximum_delay_seconds=60,
        ).model_dump(mode="json", by_alias=True),
        lease_seconds=90,
        heartbeat_seconds=30,
    )
    envelope = {
        "jobId": str(job.id),
        "dispatchSequence": 1,
        "jobType": job.job_type,
        "jobTypeVersion": 1,
        "workloadClass": str(job.workload_class),
        "messageSchemaVersion": 1,
        "targetDescriptor": {},
        "requestFingerprint": digest,
    }
    dispatch = await JobDispatchOutboxRecord.create(
        id=UUID(int=sequence),
        job_id=job.id,
        dispatch_sequence=1,
        task_name=job.task_name,
        message_schema_version=1,
        envelope=envelope,
        envelope_hash=sha256(repr(envelope).encode()).hexdigest(),
        status=status,
        workload_class=job.workload_class,
        available_at=NOW - timedelta(hours=1),
        next_dispatch_at=next_dispatch_at,
        dispatch_attempt_count=1 if status == JobDispatchStatus.DISPATCHING else 0,
        dispatcher_id="expired-dispatcher" if status == JobDispatchStatus.DISPATCHING else None,
        claim_token=uuid4() if status == JobDispatchStatus.DISPATCHING else None,
        lease_until=lease_until,
        heartbeat_at=NOW - timedelta(minutes=2) if status == JobDispatchStatus.DISPATCHING else None,
    )
    await JobDispatchOutboxRecord.filter(id=dispatch.id).update(created_at=NOW - timedelta(hours=2))
    return dispatch


async def _hold_claimed_page(
    *,
    repository: BackgroundJobRepository,
    acquired: asyncio.Event,
    release: asyncio.Event,
) -> list[UUID]:
    async with in_transaction() as conn:
        rows = await repository.list_due_dispatches_for_update(now=NOW, limit=2, conn=conn)
        acquired.set()
        await release.wait()
        return [row.id for row in rows]


async def _claim_page(
    *,
    repository: BackgroundJobRepository,
    conn: BaseDBAsyncClient,
) -> list[UUID]:
    rows = await repository.list_due_dispatches_for_update(now=NOW, limit=2, conn=conn)
    return [row.id for row in rows]


async def test_due_dispatch_claim_is_bounded_stable_and_skips_locked_rows(db_schema) -> None:
    _ = db_schema
    expected_ids = [UUID(int=index) for index in range(1, 5)]
    await _create_dispatch(sequence=1, status=JobDispatchStatus.PENDING)
    await _create_dispatch(
        sequence=2,
        status=JobDispatchStatus.DISPATCHING,
        lease_until=NOW - timedelta(seconds=1),
    )
    await _create_dispatch(
        sequence=3,
        status=JobDispatchStatus.RETRY_SCHEDULED,
        next_dispatch_at=NOW - timedelta(seconds=1),
    )
    await _create_dispatch(sequence=4, status=JobDispatchStatus.PENDING)
    await _create_dispatch(
        sequence=5,
        status=JobDispatchStatus.DISPATCHING,
        lease_until=NOW + timedelta(seconds=1),
    )
    await _create_dispatch(
        sequence=6,
        status=JobDispatchStatus.RETRY_SCHEDULED,
        next_dispatch_at=NOW + timedelta(seconds=1),
    )

    repository = BackgroundJobRepository()
    acquired = asyncio.Event()
    release = asyncio.Event()
    first_page_task = asyncio.create_task(_hold_claimed_page(repository=repository, acquired=acquired, release=release))
    second_page: list[UUID] | None = None
    probe_error: Exception | None = None
    try:
        await asyncio.wait_for(acquired.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        async with in_transaction() as conn:
            second_page = await asyncio.wait_for(
                _claim_page(repository=repository, conn=conn),
                timeout=LOCK_PROBE_TIMEOUT_SECONDS,
            )
    except Exception as exc:
        probe_error = exc
    finally:
        release.set()

    first_page = await first_page_task
    if probe_error is not None:
        raise probe_error
    assert second_page is not None
    assert first_page == expected_ids[:2]
    assert second_page == expected_ids[2:]


async def test_expired_dispatch_claim_counts_attempt_and_preserves_message_identity(db_schema) -> None:
    _ = db_schema
    repository = BackgroundJobRepository()
    dispatch = await _create_dispatch(sequence=1, status=JobDispatchStatus.PENDING)
    original_envelope = dispatch.envelope
    original_envelope_hash = dispatch.envelope_hash

    async with in_transaction() as conn:
        first_page = await repository.list_due_dispatches_for_update(now=NOW, limit=1, conn=conn)
        await repository.claim_dispatch(
            dispatch=first_page[0],
            dispatcher_id="dispatcher-1",
            claim_token=uuid4(),
            claimed_at=NOW,
            lease_until=NOW + timedelta(seconds=30),
            conn=conn,
        )

    await dispatch.refresh_from_db()
    assert dispatch.dispatch_attempt_count == 1
    assert dispatch.status == JobDispatchStatus.DISPATCHING

    second_claim_token = uuid4()
    async with in_transaction() as conn:
        reclaimed_page = await repository.list_due_dispatches_for_update(
            now=NOW + timedelta(seconds=31),
            limit=1,
            conn=conn,
        )
        await repository.claim_dispatch(
            dispatch=reclaimed_page[0],
            dispatcher_id="dispatcher-2",
            claim_token=second_claim_token,
            claimed_at=NOW + timedelta(seconds=31),
            lease_until=NOW + timedelta(seconds=61),
            conn=conn,
        )

    await dispatch.refresh_from_db()
    assert dispatch.dispatch_attempt_count == 2
    assert dispatch.claim_token == second_claim_token
    assert dispatch.dispatch_sequence == 1
    assert dispatch.envelope == original_envelope
    assert dispatch.envelope_hash == original_envelope_hash
