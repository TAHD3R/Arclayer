from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import ceil
from typing import TypedDict
from uuid import UUID

from src.config import Settings
from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.services import BaseService
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobDispatchStatus,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.modules.jobs.platform_schema import (
    PlatformJobAttemptOut,
    PlatformJobDetailOut,
    PlatformJobListQuery,
    PlatformJobOut,
    PlatformJobQueueOut,
    PlatformJobQueuesOut,
)
from src.modules.jobs.repository import BackgroundJobRepository
from src.platform.jobs.durable.manifest import TaskiqWorkloadManifest

_PLATFORM_OUTBOX_IN_FLIGHT_STATUSES = (
    JobDispatchStatus.PENDING,
    JobDispatchStatus.DISPATCHING,
    JobDispatchStatus.RETRY_SCHEDULED,
)


class PlatformJobService(BaseService):
    """Read-only Platform observability over the durable background job ledger."""

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        repository: BackgroundJobRepository | None = None,
    ) -> None:
        super().__init__(settings, default_event_source="platform-job")
        self.repository = repository or BackgroundJobRepository()

    async def queue_overview(self, *, window_hours: int) -> PlatformJobQueuesOut:
        since = datetime.now(UTC) - timedelta(hours=window_hours)
        job_counts = await self.repository.count_platform_jobs_by_workload_status()
        failures = await self.repository.count_platform_terminal_failures_by_workload(since=since)
        outbox_counts = await self.repository.count_platform_outbox_by_workload_status()
        backlog = await self.repository.platform_backlog_extremes_by_workload()
        manifest = TaskiqWorkloadManifest.for_prefixes(
            stream_prefix=self.settings.taskiq.stream_prefix,
            consumer_group_prefix=self.settings.taskiq.consumer_group_prefix,
        )
        queues = [
            _to_queue_out(
                route.workload_class,
                stream_name=route.stream_name,
                job_counts=job_counts,
                failures=failures,
                outbox_counts=outbox_counts,
                backlog=backlog.get(route.workload_class),
            )
            for route in manifest
        ]
        return PlatformJobQueuesOut(window_hours=window_hours, queues=queues)

    async def list_jobs(
        self,
        *,
        params: PageParams,
        filters: PlatformJobListQuery,
    ) -> PageData[PlatformJobOut]:
        jobs, total = await self.repository.list_platform_jobs(filters=filters, params=params)
        return _build_page(
            items=[_to_platform_job_out(job) for job in jobs],
            total=total,
            params=params,
        )

    async def get_job(self, *, job_id: UUID) -> PlatformJobDetailOut:
        job = await self.repository.get_platform_job(job_id=job_id)
        if job is None:
            raise NotFound(
                message=t("errors", "BACKGROUND_JOB_NOT_FOUND"),
                error="BACKGROUND_JOB_NOT_FOUND",
            )
        attempts = await self.repository.list_platform_job_attempts(job_id=job.id)
        return _to_platform_job_detail_out(job, attempts)


def _to_queue_out(
    workload: JobWorkloadClass,
    *,
    stream_name: str,
    job_counts: dict[tuple[JobWorkloadClass, JobInternalStatus], int],
    failures: dict[tuple[JobWorkloadClass, JobInternalStatus], int],
    outbox_counts: dict[tuple[JobWorkloadClass, JobDispatchStatus], int],
    backlog: tuple[datetime | None, datetime | None] | None,
) -> PlatformJobQueueOut:
    return PlatformJobQueueOut(
        workload=workload,
        stream_name=stream_name,
        pending_dispatch_jobs=job_counts.get((workload, JobInternalStatus.PENDING_DISPATCH), 0),
        queued_jobs=job_counts.get((workload, JobInternalStatus.QUEUED), 0),
        running_jobs=job_counts.get((workload, JobInternalStatus.RUNNING), 0),
        retry_scheduled_jobs=job_counts.get((workload, JobInternalStatus.RETRY_SCHEDULED), 0),
        waiting_for_user_jobs=job_counts.get((workload, JobInternalStatus.WAITING_FOR_USER), 0),
        failed_jobs_in_window=failures.get((workload, JobInternalStatus.FAILED), 0),
        dead_lettered_jobs_in_window=failures.get((workload, JobInternalStatus.DEAD_LETTERED), 0),
        outbox_in_flight_dispatches=sum(
            outbox_counts.get((workload, status), 0) for status in _PLATFORM_OUTBOX_IN_FLIGHT_STATUSES
        ),
        outbox_dead_lettered_dispatches=outbox_counts.get((workload, JobDispatchStatus.DEAD_LETTERED), 0),
        oldest_backlog_created_at=backlog[0] if backlog is not None else None,
        oldest_backlog_next_attempt_at=backlog[1] if backlog is not None else None,
    )


class _JobProjection(TypedDict):
    id: UUID
    job_type: str
    job_type_version: int
    workload: JobWorkloadClass
    status: JobInternalStatus
    workspace_id: UUID | None
    project_id: UUID | None
    site_id: UUID | None
    phase: str | None
    status_key: str | None
    progress_completed: int
    progress_total: int | None
    attempt_count: int
    next_attempt_at: datetime | None
    cancel_requested_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    retry_of_job_id: UUID | None
    error_code: str | None
    correlation_id: str
    created_at: datetime
    updated_at: datetime


def _job_projection_kwargs(job: BackgroundJobRecord) -> _JobProjection:
    return {
        "id": job.id,
        "job_type": job.job_type,
        "job_type_version": job.job_type_version,
        "workload": job.workload_class,
        "status": job.internal_status,
        "workspace_id": job.workspace_id,
        "project_id": job.project_id,
        "site_id": job.site_id,
        "phase": job.phase,
        "status_key": job.status_key,
        "progress_completed": job.progress_completed,
        "progress_total": job.progress_total,
        "attempt_count": job.attempt_count,
        "next_attempt_at": job.next_attempt_at,
        "cancel_requested_at": job.cancel_requested_at,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "retry_of_job_id": job.retry_of_job_id,
        "error_code": job.error_code,
        "correlation_id": job.correlation_id,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


def _to_platform_job_out(job: BackgroundJobRecord) -> PlatformJobOut:
    return PlatformJobOut(**_job_projection_kwargs(job))


def _to_platform_job_detail_out(
    job: BackgroundJobRecord,
    attempts: list[JobAttemptRecord],
) -> PlatformJobDetailOut:
    return PlatformJobDetailOut(
        **_job_projection_kwargs(job),
        error_message=job.error_message,
        attempts=[
            PlatformJobAttemptOut(
                id=attempt.id,
                attempt_number=attempt.attempt_number,
                status=attempt.status,
                worker_id=attempt.worker_id,
                started_at=attempt.started_at,
                completed_at=attempt.completed_at,
                failure_classification=attempt.failure_classification,
                retry_decision=attempt.retry_decision,
                retry_at=attempt.retry_at,
                retry_delay_seconds=attempt.retry_delay_seconds,
                error_code=attempt.error_code,
                error_message=attempt.error_message,
            )
            for attempt in attempts
        ],
    )


def _build_page(
    *,
    items: list[PlatformJobOut],
    total: int,
    params: PageParams,
) -> PageData[PlatformJobOut]:
    pages = ceil(total / params.size) if total else 0
    return PageData[PlatformJobOut](
        items=items,
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        next=params.page + 1 if params.page < pages else None,
        prev=min(params.page - 1, pages) if pages > 0 and params.page > 1 else None,
    )
