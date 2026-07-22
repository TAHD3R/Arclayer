from __future__ import annotations

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
from src.modules.jobs.execution_errors import WorkerLostJobExecutionError
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.reaper_schema import JobLeaseReapOutcome
from src.modules.jobs.schema import build_job_dispatch_envelope


class JobLeaseReaperInvariantError(RuntimeError):
    """Locked Job/Attempt state cannot prove the requested lease recovery."""


def replay_exact_reap(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    next_dispatch: JobDispatchOutboxRecord | None,
) -> JobLeaseReapOutcome:
    """Project a prior lease recovery only from complete persisted evidence."""

    _require_worker_loss_evidence(job=job, attempt=attempt)
    if attempt.retry_decision == JobRetryDecision.SCHEDULED:
        _require_retry_replay(
            job=job,
            attempt=attempt,
            next_dispatch=next_dispatch,
        )
        return JobLeaseReapOutcome(
            job_id=job.id,
            attempt_id=attempt.id,
            internal_status=JobInternalStatus.RETRY_SCHEDULED,
            retry_at=attempt.retry_at,
            is_replay=True,
        )
    _require_dead_letter_replay(
        job=job,
        attempt=attempt,
        next_dispatch=next_dispatch,
    )
    return JobLeaseReapOutcome(
        job_id=job.id,
        attempt_id=attempt.id,
        internal_status=JobInternalStatus.DEAD_LETTERED,
        is_replay=True,
    )


def _require_worker_loss_evidence(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
) -> None:
    error = WorkerLostJobExecutionError()
    if (
        attempt.attempt_number != job.attempt_count
        or attempt.status != JobAttemptStatus.LEASE_EXPIRED
        or attempt.completed_at is None
        or attempt.result_reference is not None
        or attempt.failure_classification != JobFailureClassification.WORKER_LOST
        or attempt.error_code != error.code
        or attempt.error_message != error.safe_message
        or attempt.error_metadata != error.metadata
        or job.result_reference is not None
        or job.error_code != attempt.error_code
        or job.error_message != attempt.error_message
        or job.error_metadata != attempt.error_metadata
    ):
        raise JobLeaseReaperInvariantError(f"Exact lease reap Attempt {attempt.id} lacks complete worker-loss evidence")


def _require_retry_replay(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    next_dispatch: JobDispatchOutboxRecord | None,
) -> None:
    if (
        job.internal_status != JobInternalStatus.RETRY_SCHEDULED
        or job.completed_at is not None
        or job.next_attempt_at is None
        or attempt.retry_at != job.next_attempt_at
        or attempt.completed_at is None
        or attempt.retry_at < attempt.completed_at
        or attempt.retry_schedule_source != JobRetryScheduleSource.EXPONENTIAL_FULL_JITTER
        or attempt.retry_delay_seconds is None
        or attempt.retry_delay_seconds < 0
        or attempt.retry_hint_rejection_reason is not None
    ):
        raise JobLeaseReaperInvariantError(f"Exact lease reap Attempt {attempt.id} lacks a coherent retry projection")
    expected_envelope = build_job_dispatch_envelope(
        job=job,
        dispatch_sequence=attempt.attempt_number + 1,
    )
    serialized_envelope = expected_envelope.model_dump(mode="json", by_alias=True)
    if (
        next_dispatch is None
        or next_dispatch.job_id != job.id
        or next_dispatch.dispatch_sequence != attempt.attempt_number + 1
        or next_dispatch.task_name != job.task_name
        or next_dispatch.message_schema_version != expected_envelope.message_schema_version
        or next_dispatch.workload_class != job.workload_class
        or next_dispatch.status != JobDispatchStatus.PENDING
        or next_dispatch.available_at != attempt.retry_at
        or next_dispatch.envelope != serialized_envelope
        or next_dispatch.envelope_hash != hash_json(serialized_envelope)
    ):
        raise JobLeaseReaperInvariantError(f"Exact lease reap Attempt {attempt.id} lacks its coherent retry outbox")


def _require_dead_letter_replay(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    next_dispatch: JobDispatchOutboxRecord | None,
) -> None:
    if (
        attempt.retry_decision
        not in {
            JobRetryDecision.EXHAUSTED,
            JobRetryDecision.CODE_NOT_ALLOWED,
            JobRetryDecision.NOT_RETRYABLE,
        }
        or job.internal_status != JobInternalStatus.DEAD_LETTERED
        or job.completed_at is None
        or attempt.completed_at != job.completed_at
        or job.next_attempt_at is not None
        or attempt.retry_at is not None
        or attempt.retry_schedule_source is not None
        or attempt.retry_delay_seconds is not None
        or attempt.retry_hint_rejection_reason is not None
        or next_dispatch is not None
    ):
        raise JobLeaseReaperInvariantError(
            f"Exact lease reap Attempt {attempt.id} lacks a coherent dead-letter projection"
        )
