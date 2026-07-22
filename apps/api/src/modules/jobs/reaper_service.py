from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.i18n import t
from src.core.services import BaseService
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobInternalStatus,
)
from src.modules.jobs.execution_errors import WorkerLostJobExecutionError
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.execution_retry_dispatch import create_retry_dispatch
from src.modules.jobs.execution_schema import JobExecutionTerminalOutcome
from src.modules.jobs.execution_terminal_state import (
    FailureProjection,
    build_failure_projection,
    failure_job_fields,
)
from src.modules.jobs.execution_validation import attempt_is_expired
from src.modules.jobs.reaper_schema import (
    JobLeaseReapBatch,
    JobLeaseReapCandidate,
    JobLeaseReapOutcome,
)
from src.modules.jobs.reaper_state import (
    JobLeaseReaperInvariantError,
    replay_exact_reap,
)

_ACTIVE_ATTEMPT_STATUSES = frozenset({JobAttemptStatus.CLAIMED, JobAttemptStatus.RUNNING})


class BackgroundJobLeaseReaperService(BaseService):
    """Bounded maintenance recovery for expired fenced execution Attempts."""

    def __init__(
        self,
        settings: Settings,
        *,
        repository: JobExecutionRepository,
        retry_jitter: Callable[[], float],
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="job-lease-reaper")
        self.repository = repository
        self.retry_jitter = retry_jitter

    async def reap_expired_attempts(self, *, limit: int) -> JobLeaseReapBatch:
        if limit < 1:
            raise BadRequest(
                message=t("errors", "BACKGROUND_JOB_REAP_LIMIT_INVALID"),
                error="BACKGROUND_JOB_REAP_LIMIT_INVALID",
            )
        async with self.tx() as conn:
            selection_time = await self.repository.get_database_time(conn=conn)
            candidates = await self.repository.list_expired_attempt_candidates(
                now=selection_time,
                limit=limit,
                conn=conn,
            )

        outcomes: list[JobLeaseReapOutcome] = []
        for candidate in candidates:
            outcome = await self._reap_candidate(candidate)
            if outcome is not None:
                outcomes.append(outcome)
        return JobLeaseReapBatch(
            scanned_count=len(candidates),
            outcomes=tuple(outcomes),
        )

    async def reap_exact(
        self,
        *,
        job_id: UUID,
        attempt_id: UUID,
    ) -> JobLeaseReapOutcome:
        """Reap one expired Attempt or replay its exact durable recovery outcome."""

        async with self.tx() as conn:
            job = await self.repository.get_job_for_update(job_id=job_id, conn=conn)
            if job is None:
                raise JobLeaseReaperInvariantError(f"Exact lease reap Job {job_id} does not exist")
            attempt = await self.repository.get_job_attempt_for_update(
                job_id=job_id,
                attempt_id=attempt_id,
                conn=conn,
            )
            if attempt is None:
                raise JobLeaseReaperInvariantError(
                    f"Exact lease reap Job {job_id} and Attempt {attempt_id} identity does not match"
                )
            database_now = await self.repository.get_database_time(conn=conn)
            self._require_exact_identity(
                job=job,
                attempt=attempt,
                job_id=job_id,
                attempt_id=attempt_id,
            )
            if job.internal_status != JobInternalStatus.RUNNING or attempt.status not in _ACTIVE_ATTEMPT_STATUSES:
                next_dispatch = await self.repository.get_job_dispatch(
                    job_id=job.id,
                    dispatch_sequence=attempt.attempt_number + 1,
                    conn=conn,
                )
                return replay_exact_reap(
                    job=job,
                    attempt=attempt,
                    next_dispatch=next_dispatch,
                )
            self._require_current_generation(job=job, attempt=attempt)
            if not attempt_is_expired(attempt=attempt, observed_at=database_now):
                raise JobLeaseReaperInvariantError(
                    f"Exact lease reap Attempt {attempt.id} has not expired at the locked database clock"
                )
            return await self._reap_locked(
                job=job,
                attempt=attempt,
                database_now=database_now,
                conn=conn,
            )

    async def _reap_candidate(
        self,
        candidate: JobLeaseReapCandidate,
    ) -> JobLeaseReapOutcome | None:
        async with self.tx() as conn:
            job = await self.repository.get_job_for_update(job_id=candidate.job_id, conn=conn)
            if job is None or job.internal_status != JobInternalStatus.RUNNING:
                return None
            attempt = await self.repository.get_attempt_for_update(
                attempt_id=candidate.attempt_id,
                conn=conn,
            )
            if attempt is None:
                raise JobLeaseReaperInvariantError(
                    f"Running Job {job.id} is missing expiration candidate Attempt {candidate.attempt_id}"
                )
            database_now = await self.repository.get_database_time(conn=conn)
            if not self._is_current_expired_attempt(
                job=job,
                attempt=attempt,
                candidate=candidate,
                database_now=database_now,
            ):
                return None
            return await self._reap_locked(
                job=job,
                attempt=attempt,
                database_now=database_now,
                conn=conn,
            )

    async def _reap_locked(
        self,
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
        database_now: datetime,
        conn: BaseDBAsyncClient,
    ) -> JobLeaseReapOutcome:
        projection = self._build_worker_loss_projection(
            job=job,
            attempt=attempt,
            database_now=database_now,
        )
        await self.repository.finish_attempt(
            attempt=attempt,
            status=JobAttemptStatus.LEASE_EXPIRED,
            completed_at=database_now,
            failure=projection.failure,
            conn=conn,
        )
        await self.repository.update_job_fields(
            job=job,
            fields=failure_job_fields(projection.outcome),
            conn=conn,
        )
        if projection.retry_schedule is not None:
            await create_retry_dispatch(
                repository=self.repository,
                job=job,
                dispatch_sequence=attempt.attempt_number + 1,
                available_at=projection.retry_schedule.retry_at,
                conn=conn,
            )
        return JobLeaseReapOutcome(
            job_id=job.id,
            attempt_id=attempt.id,
            internal_status=projection.outcome.internal_status,
            retry_at=projection.outcome.next_attempt_at,
        )

    @staticmethod
    def _is_current_expired_attempt(
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
        candidate: JobLeaseReapCandidate,
        database_now: datetime,
    ) -> bool:
        if attempt.job_id != job.id or attempt.id != candidate.attempt_id:
            raise JobLeaseReaperInvariantError("Expiration candidate identity changed before reaping")
        if attempt.status not in _ACTIVE_ATTEMPT_STATUSES:
            raise JobLeaseReaperInvariantError(f"Running Job {job.id} points to non-active Attempt {attempt.id}")
        BackgroundJobLeaseReaperService._require_current_generation(job=job, attempt=attempt)
        return attempt_is_expired(attempt=attempt, observed_at=database_now)

    @staticmethod
    def _require_current_generation(
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
    ) -> None:
        if attempt.attempt_number != job.attempt_count:
            raise JobLeaseReaperInvariantError(
                f"Running Job {job.id} current generation differs from Attempt {attempt.id}"
            )

    @staticmethod
    def _require_exact_identity(
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
        job_id: UUID,
        attempt_id: UUID,
    ) -> None:
        if job.id != job_id or attempt.id != attempt_id or attempt.job_id != job.id:
            raise JobLeaseReaperInvariantError(
                f"Exact lease reap Job {job_id} and Attempt {attempt_id} identity does not match"
            )

    def _build_worker_loss_projection(
        self,
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
        database_now: datetime,
    ) -> FailureProjection:
        error = WorkerLostJobExecutionError()
        projection = build_failure_projection(
            job=job,
            attempt=attempt,
            error=error,
            database_now=database_now,
            retry_jitter=self.retry_jitter,
        )
        if projection.outcome.internal_status != JobInternalStatus.FAILED:
            return projection
        dead_lettered = JobExecutionTerminalOutcome(
            job_id=job.id,
            attempt_id=attempt.id,
            internal_status=JobInternalStatus.DEAD_LETTERED,
            completed_at=database_now,
            error_code=projection.failure.error_code,
            error_message=projection.failure.error_message,
            error_metadata=projection.failure.error_metadata,
        )
        return FailureProjection(
            outcome=dead_lettered,
            failure=projection.failure,
            retry_schedule=None,
        )
