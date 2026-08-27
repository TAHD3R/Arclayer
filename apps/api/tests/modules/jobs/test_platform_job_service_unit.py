from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import NotFound
from src.core.http.pagination import PageParams
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchStatus,
    JobFailureClassification,
    JobInternalStatus,
    JobRetryClass,
    JobRetryDecision,
    JobWorkloadClass,
)
from src.modules.jobs.platform_schema import (
    PlatformJobListQuery,
    PlatformJobOut,
)
from src.modules.jobs.platform_service import PlatformJobService
from src.modules.jobs.repository import BackgroundJobRepository

pytestmark = pytest.mark.unit

NOW = datetime(2026, 8, 27, 12, tzinfo=UTC)
CANONICAL_WORKLOAD_ORDER = (
    JobWorkloadClass.AGENT_IO,
    JobWorkloadClass.RENDER_BROWSER,
    JobWorkloadClass.ASSET_CPU,
    JobWorkloadClass.PUBLISH,
    JobWorkloadClass.CONNECTOR,
    JobWorkloadClass.MAINTENANCE,
)


class FakePlatformJobRepository:
    def __init__(
        self,
        *,
        jobs: list[BackgroundJobRecord] | None = None,
        attempts: list[JobAttemptRecord] | None = None,
        job_counts: dict[tuple[JobWorkloadClass, JobInternalStatus], int] | None = None,
        failures: dict[tuple[JobWorkloadClass, JobInternalStatus], int] | None = None,
        outbox_counts: dict[tuple[JobWorkloadClass, JobDispatchStatus], int] | None = None,
        backlog: dict[JobWorkloadClass, tuple[datetime | None, datetime | None]] | None = None,
    ) -> None:
        self.jobs = jobs or []
        self.attempts = attempts or []
        self.job_counts = job_counts or {}
        self.failures = failures or {}
        self.outbox_counts = outbox_counts or {}
        self.backlog = backlog or {}
        self.last_list: dict[str, Any] | None = None
        self.failure_since: datetime | None = None

    async def list_platform_jobs(self, **kwargs) -> tuple[list[BackgroundJobRecord], int]:
        self.last_list = kwargs
        return self.jobs, len(self.jobs)

    async def get_platform_job(self, *, job_id: UUID) -> BackgroundJobRecord | None:
        return next((job for job in self.jobs if job.id == job_id), None)

    async def list_platform_job_attempts(self, *, job_id: UUID) -> list[JobAttemptRecord]:
        return list(self.attempts)

    async def count_platform_jobs_by_workload_status(
        self,
    ) -> dict[tuple[JobWorkloadClass, JobInternalStatus], int]:
        return self.job_counts

    async def count_platform_terminal_failures_by_workload(
        self,
        *,
        since: datetime,
    ) -> dict[tuple[JobWorkloadClass, JobInternalStatus], int]:
        self.failure_since = since
        return self.failures

    async def count_platform_outbox_by_workload_status(
        self,
    ) -> dict[tuple[JobWorkloadClass, JobDispatchStatus], int]:
        return self.outbox_counts

    async def platform_backlog_extremes_by_workload(
        self,
    ) -> dict[JobWorkloadClass, tuple[datetime | None, datetime | None]]:
        return self.backlog


def _service(repository: FakePlatformJobRepository) -> PlatformJobService:
    return PlatformJobService(repository=cast(BackgroundJobRepository, repository))


def create_job(
    *,
    job_id: UUID | None = None,
    internal_status: JobInternalStatus = JobInternalStatus.RETRY_SCHEDULED,
    error_code: str | None = "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
    next_attempt_at: datetime | None = NOW,
) -> BackgroundJobRecord:
    return BackgroundJobRecord(
        id=job_id or uuid4(),
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        task_name="jobs:asset-cpu:asset-thumbnail:v1",
        workload_class=JobWorkloadClass.ASSET_CPU,
        internal_status=internal_status,
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy={"maxAttempts": 3},
        workspace_id=uuid4(),
        project_id=uuid4(),
        actor_user_id=uuid4(),
        target_descriptor={},
        idempotency_scope_key="scope",
        idempotency_key_hash="a" * 64,
        request_fingerprint="b" * 64,
        correlation_id="platform-job-test",
        attempt_count=2,
        next_attempt_at=next_attempt_at,
        started_at=NOW - timedelta(hours=1),
        completed_at=None,
        error_code=error_code,
        created_at=NOW - timedelta(hours=2),
        updated_at=NOW,
    )


def create_attempt(*, job_id: UUID) -> JobAttemptRecord:
    return JobAttemptRecord(
        id=uuid4(),
        job_id=job_id,
        dispatch_id=uuid4(),
        attempt_number=2,
        fencing_token=uuid4(),
        status=JobAttemptStatus.FAILED,
        worker_id="worker-asset-cpu-1",
        handler_version=1,
        claimed_at=NOW - timedelta(minutes=30),
        lease_until=NOW - timedelta(minutes=20),
        heartbeat_at=NOW - timedelta(minutes=25),
        started_at=NOW - timedelta(minutes=30),
        completed_at=NOW - timedelta(minutes=21),
        error_code="ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
        error_message="storage temporarily unavailable",
        failure_classification=JobFailureClassification.TRANSIENT,
        retry_decision=JobRetryDecision.SCHEDULED,
        retry_at=NOW,
        retry_delay_seconds=12.0,
        created_at=NOW - timedelta(minutes=30),
        updated_at=NOW - timedelta(minutes=20),
    )


@pytest.mark.asyncio
async def test_queue_overview_projects_every_canonical_workload_with_zero_fill() -> None:
    repository = FakePlatformJobRepository(
        job_counts={
            (JobWorkloadClass.ASSET_CPU, JobInternalStatus.RUNNING): 2,
            (JobWorkloadClass.PUBLISH, JobInternalStatus.PENDING_DISPATCH): 1,
            (JobWorkloadClass.PUBLISH, JobInternalStatus.QUEUED): 3,
        },
        failures={
            (JobWorkloadClass.ASSET_CPU, JobInternalStatus.FAILED): 4,
            (JobWorkloadClass.MAINTENANCE, JobInternalStatus.DEAD_LETTERED): 1,
        },
        outbox_counts={
            (JobWorkloadClass.PUBLISH, JobDispatchStatus.PENDING): 1,
            (JobWorkloadClass.PUBLISH, JobDispatchStatus.DISPATCHING): 2,
            (JobWorkloadClass.PUBLISH, JobDispatchStatus.RETRY_SCHEDULED): 4,
            (JobWorkloadClass.MAINTENANCE, JobDispatchStatus.DEAD_LETTERED): 2,
        },
        backlog={
            JobWorkloadClass.PUBLISH: (NOW - timedelta(hours=3), NOW + timedelta(minutes=5)),
        },
    )

    service = _service(repository)
    overview = await service.queue_overview(window_hours=24)

    assert overview.window_hours == 24
    assert [queue.workload for queue in overview.queues] == list(CANONICAL_WORKLOAD_ORDER)
    stream_prefix = service.settings.taskiq.stream_prefix
    assert {queue.stream_name for queue in overview.queues} == {
        f"{stream_prefix}:{workload.value}" for workload in CANONICAL_WORKLOAD_ORDER
    }

    publish = overview.queues[3]
    assert publish.workload == JobWorkloadClass.PUBLISH
    assert publish.pending_dispatch_jobs == 1
    assert publish.queued_jobs == 3
    assert publish.running_jobs == 0
    assert publish.retry_scheduled_jobs == 0
    assert publish.waiting_for_user_jobs == 0
    assert publish.failed_jobs_in_window == 0
    assert publish.dead_lettered_jobs_in_window == 0
    assert publish.outbox_in_flight_dispatches == 7
    assert publish.outbox_dead_lettered_dispatches == 0
    assert publish.oldest_backlog_created_at == NOW - timedelta(hours=3)
    assert publish.oldest_backlog_next_attempt_at == NOW + timedelta(minutes=5)

    asset_cpu = overview.queues[2]
    assert asset_cpu.running_jobs == 2
    assert asset_cpu.failed_jobs_in_window == 4
    assert asset_cpu.outbox_in_flight_dispatches == 0
    assert asset_cpu.oldest_backlog_created_at is None

    maintenance = overview.queues[5]
    assert maintenance.dead_lettered_jobs_in_window == 1
    assert maintenance.outbox_dead_lettered_dispatches == 2

    assert repository.failure_since is not None
    expected_since = datetime.now(UTC) - timedelta(hours=24)
    assert abs((repository.failure_since - expected_since).total_seconds()) < 60


@pytest.mark.asyncio
async def test_list_jobs_maps_records_to_safe_projection_and_forwards_filters() -> None:
    job = create_job()
    repository = FakePlatformJobRepository(jobs=[job])
    params = PageParams(page=2, size=10)
    filters = PlatformJobListQuery(
        status=JobInternalStatus.RETRY_SCHEDULED,
        workload=JobWorkloadClass.ASSET_CPU,
        error_code="ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
    )

    page = await _service(repository).list_jobs(params=params, filters=filters)

    assert page.total == 1
    assert page.page == 2
    assert page.size == 10
    assert len(page.items) == 1
    item: PlatformJobOut = page.items[0]
    assert item.status == JobInternalStatus.RETRY_SCHEDULED
    assert item.workload == JobWorkloadClass.ASSET_CPU
    assert item.attempt_count == 2
    assert item.correlation_id == "platform-job-test"
    assert repository.last_list is not None
    assert repository.last_list["params"] is params
    assert repository.last_list["filters"] is filters


@pytest.mark.asyncio
async def test_get_job_returns_attempts_and_raises_not_found_for_missing_job() -> None:
    job = create_job()
    attempt = create_attempt(job_id=job.id)
    repository = FakePlatformJobRepository(jobs=[job], attempts=[attempt])

    detail = await _service(repository).get_job(job_id=job.id)

    assert detail.id == job.id
    assert detail.error_message is None
    assert len(detail.attempts) == 1
    assert detail.attempts[0].attempt_number == 2
    assert detail.attempts[0].status == JobAttemptStatus.FAILED
    assert detail.attempts[0].failure_classification == JobFailureClassification.TRANSIENT
    assert detail.attempts[0].retry_decision == JobRetryDecision.SCHEDULED
    assert detail.attempts[0].retry_delay_seconds == 12.0

    with pytest.raises(NotFound) as exc_info:
        await _service(FakePlatformJobRepository()).get_job(job_id=uuid4())
    assert exc_info.value.error == "BACKGROUND_JOB_NOT_FOUND"
