from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import cast

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobFailureClassification,
    JobInternalStatus,
    JobRetryClass,
    JobRetryDecision,
)
from src.modules.jobs.execution_errors import (
    JobExecutionLeaseLostError,
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
    WorkerLostJobExecutionError,
)
from src.modules.jobs.execution_registry import JobHandledInterruption
from src.modules.jobs.execution_schema import (
    JobExecutionLease,
    JobExecutionTerminalOutcome,
    JobSuccessCancellationDisposition,
)
from src.modules.jobs.execution_validation import execution_identity_matches
from src.modules.jobs.retry import (
    JobRetryCalculation,
    JobRetryPolicy,
    JobRetrySchedule,
    evaluate_retry_schedule,
)
from src.modules.jobs.schema import BackgroundJobFailure

type TerminalExecutionError = PermanentJobExecutionError | TransientJobExecutionError | UnexpectedJobExecutionError


class JobExecutionTerminalInvariantError(RuntimeError):
    """A terminal Job/Attempt pair contradicts the exact fenced replay command."""


class FailureProjection(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    outcome: JobExecutionTerminalOutcome
    failure: BackgroundJobFailure
    retry_schedule: JobRetrySchedule | None


def build_failure_projection(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    error: TerminalExecutionError,
    database_now: datetime,
    retry_jitter: Callable[[], float],
) -> FailureProjection:
    policy = JobRetryPolicy.model_validate(job.retry_policy)
    retry_schedule = _calculate_retry_schedule(
        job=job,
        attempt=attempt,
        error=error,
        policy=policy,
        database_now=database_now,
        retry_jitter=retry_jitter,
    )
    retry_decision = _retry_decision(
        job=job,
        attempt=attempt,
        error=error,
        policy=policy,
    )
    if retry_decision == JobRetryDecision.SCHEDULED:
        internal_status = JobInternalStatus.RETRY_SCHEDULED
    elif retry_decision == JobRetryDecision.EXHAUSTED:
        internal_status = JobInternalStatus.DEAD_LETTERED
    else:
        internal_status = JobInternalStatus.FAILED
    schedule = retry_schedule.schedule
    failure = BackgroundJobFailure(
        error_code=error.code,
        error_message=error.safe_message,
        error_metadata=error.metadata,
        failure_classification=_failure_classification(error),
        retry_decision=retry_decision,
        retry_at=schedule.retry_at if schedule is not None else None,
        retry_schedule_source=schedule.source if schedule is not None else None,
        retry_delay_seconds=schedule.delay_seconds if schedule is not None else None,
        retry_hint_rejection_reason=retry_schedule.provider_hint_rejection_reason,
    )
    return FailureProjection(
        outcome=_failure_outcome(
            job=job,
            attempt=attempt,
            failure=failure,
            internal_status=internal_status,
            database_now=database_now,
        ),
        failure=failure,
        retry_schedule=schedule,
    )


def _calculate_retry_schedule(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    error: TerminalExecutionError,
    policy: JobRetryPolicy,
    database_now: datetime,
    retry_jitter: Callable[[], float],
) -> JobRetryCalculation:
    if (
        not isinstance(error, TransientJobExecutionError)
        or job.retry_class != JobRetryClass.TRANSIENT
        or error.code not in policy.retryable_codes
        or attempt.attempt_number >= policy.max_attempts
    ):
        return JobRetryCalculation(schedule=None)
    return evaluate_retry_schedule(
        policy=policy,
        completed_attempt_number=attempt.attempt_number,
        error_code=error.code,
        now=database_now,
        jitter_ratio=retry_jitter(),
        provider_retry_after_seconds=error.provider_retry_after_seconds,
    )


def _failure_classification(error: TerminalExecutionError) -> JobFailureClassification:
    if isinstance(error, WorkerLostJobExecutionError):
        return JobFailureClassification.WORKER_LOST
    if isinstance(error, TransientJobExecutionError):
        return JobFailureClassification.TRANSIENT
    if isinstance(error, UnexpectedJobExecutionError):
        return JobFailureClassification.UNEXPECTED
    return JobFailureClassification.PERMANENT


def _retry_decision(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    error: TerminalExecutionError,
    policy: JobRetryPolicy,
) -> JobRetryDecision:
    if isinstance(error, WorkerLostJobExecutionError) and (
        job.retry_class != JobRetryClass.TRANSIENT or attempt.attempt_number >= policy.max_attempts
    ):
        return JobRetryDecision.EXHAUSTED
    if not isinstance(error, TransientJobExecutionError) or job.retry_class != JobRetryClass.TRANSIENT:
        return JobRetryDecision.NOT_RETRYABLE
    if error.code not in policy.retryable_codes:
        return JobRetryDecision.CODE_NOT_ALLOWED
    if attempt.attempt_number >= policy.max_attempts:
        return JobRetryDecision.EXHAUSTED
    return JobRetryDecision.SCHEDULED


def replay_success(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    lease: JobExecutionLease,
    result_reference: JsonObject,
    cancellation_disposition: JobSuccessCancellationDisposition,
) -> JobExecutionTerminalOutcome | None:
    if _is_live(job=job, attempt=attempt):
        return None
    _require_replay_identity(job=job, attempt=attempt, lease=lease)
    expected_acknowledgement = (
        job.completed_at
        if (
            cancellation_disposition == JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT
            and job.cancel_requested_at is not None
        )
        else None
    )
    if (
        job.internal_status != JobInternalStatus.SUCCEEDED
        or attempt.status != JobAttemptStatus.SUCCEEDED
        or job.completed_at is None
        or attempt.completed_at != job.completed_at
        or job.result_reference != result_reference
        or attempt.result_reference != result_reference
        or job.error_code is not None
        or job.error_message is not None
        or job.error_metadata is not None
        or attempt.error_code is not None
        or attempt.error_message is not None
        or attempt.error_metadata is not None
        or job.cancellation_acknowledged_at != expected_acknowledgement
        or (
            cancellation_disposition == JobSuccessCancellationDisposition.REQUIRE_NONE
            and job.cancel_requested_at is not None
        )
    ):
        raise JobExecutionTerminalInvariantError("success replay differs from the durable terminal outcome")
    return _outcome_from_job(job=job, attempt=attempt, is_replay=True)


def replay_failure(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    lease: JobExecutionLease,
    error: TerminalExecutionError,
) -> JobExecutionTerminalOutcome | None:
    if _is_live(job=job, attempt=attempt):
        return None
    _require_replay_identity(job=job, attempt=attempt, lease=lease)
    if (
        job.internal_status
        not in {JobInternalStatus.RETRY_SCHEDULED, JobInternalStatus.FAILED, JobInternalStatus.DEAD_LETTERED}
        or attempt.status != JobAttemptStatus.FAILED
        or job.error_code != error.code
        or job.error_message != error.safe_message
        or job.error_metadata != error.metadata
        or attempt.error_code != error.code
        or attempt.error_message != error.safe_message
        or attempt.error_metadata != error.metadata
    ):
        raise JobExecutionTerminalInvariantError("failure replay differs from the durable failure evidence")
    return _outcome_from_job(job=job, attempt=attempt, is_replay=True)


def replay_cancellation(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    lease: JobExecutionLease,
) -> JobExecutionTerminalOutcome | None:
    if _is_live(job=job, attempt=attempt):
        return None
    _require_replay_identity(job=job, attempt=attempt, lease=lease)
    if (
        job.internal_status != JobInternalStatus.CANCELLED
        or attempt.status != JobAttemptStatus.CANCELLED
        or job.cancel_requested_at is None
        or job.completed_at is None
        or attempt.completed_at != job.completed_at
        or job.cancellation_acknowledged_at != job.completed_at
        or job.result_reference is not None
        or attempt.result_reference is not None
        or job.error_code is not None
        or job.error_message is not None
        or job.error_metadata is not None
        or attempt.error_code is not None
        or attempt.error_message is not None
        or attempt.error_metadata is not None
    ):
        raise JobExecutionTerminalInvariantError("cancellation replay differs from the durable terminal outcome")
    return _outcome_from_job(job=job, attempt=attempt, is_replay=True)


def replay_interruption(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    lease: JobExecutionLease,
    interruption: JobHandledInterruption,
) -> JobExecutionTerminalOutcome | None:
    if _is_live(job=job, attempt=attempt):
        return None
    _require_replay_identity(job=job, attempt=attempt, lease=lease)
    if (
        job.internal_status != JobInternalStatus.WAITING_FOR_USER
        or attempt.status != JobAttemptStatus.INTERRUPTED
        or attempt.completed_at is None
        or job.completed_at is not None
        or job.next_attempt_at is not None
        or job.phase != interruption.phase
        or job.status_key != interruption.status_key
        or job.continuation_reference != interruption.continuation_reference
        or job.result_reference is not None
        or attempt.result_reference is not None
        or job.error_code is not None
        or job.error_message is not None
        or job.error_metadata is not None
        or attempt.error_code is not None
        or attempt.error_message is not None
        or attempt.error_metadata is not None
    ):
        raise JobExecutionTerminalInvariantError("interruption replay differs from the durable continuation")
    return _outcome_from_job(job=job, attempt=attempt, is_replay=True)


def _is_live(*, job: BackgroundJobRecord, attempt: JobAttemptRecord) -> bool:
    return job.internal_status == JobInternalStatus.RUNNING and attempt.status == JobAttemptStatus.RUNNING


def _require_replay_identity(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    lease: JobExecutionLease,
) -> None:
    if not execution_identity_matches(job=job, attempt=attempt, lease=lease):
        raise JobExecutionLeaseLostError(
            job_id=job.id,
            attempt_id=attempt.id,
            reason="Terminal replay does not match the persisted Attempt fence",
        )


def success_outcome(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    completed_at: datetime,
    result_reference: JsonObject,
) -> JobExecutionTerminalOutcome:
    return JobExecutionTerminalOutcome(
        job_id=job.id,
        attempt_id=attempt.id,
        internal_status=JobInternalStatus.SUCCEEDED,
        completed_at=completed_at,
        result_reference=result_reference,
    )


def interruption_outcome(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    interruption: JobHandledInterruption,
) -> JobExecutionTerminalOutcome:
    return JobExecutionTerminalOutcome(
        job_id=job.id,
        attempt_id=attempt.id,
        internal_status=JobInternalStatus.WAITING_FOR_USER,
        continuation_reference=interruption.continuation_reference,
    )


def _failure_outcome(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    failure: BackgroundJobFailure,
    internal_status: JobInternalStatus,
    database_now: datetime,
) -> JobExecutionTerminalOutcome:
    return JobExecutionTerminalOutcome(
        job_id=job.id,
        attempt_id=attempt.id,
        internal_status=internal_status,
        completed_at=database_now if internal_status != JobInternalStatus.RETRY_SCHEDULED else None,
        next_attempt_at=failure.retry_at if internal_status == JobInternalStatus.RETRY_SCHEDULED else None,
        error_code=failure.error_code,
        error_message=failure.error_message,
        error_metadata=failure.error_metadata,
    )


def _outcome_from_job(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    is_replay: bool,
) -> JobExecutionTerminalOutcome:
    return JobExecutionTerminalOutcome(
        job_id=job.id,
        attempt_id=attempt.id,
        internal_status=job.internal_status,
        completed_at=job.completed_at,
        next_attempt_at=job.next_attempt_at,
        result_reference=cast(JsonObject | None, job.result_reference),
        continuation_reference=cast(JsonObject | None, job.continuation_reference),
        error_code=job.error_code,
        error_message=job.error_message,
        error_metadata=cast(JsonObject | None, job.error_metadata),
        is_replay=is_replay,
    )


def success_job_fields(
    *,
    job: BackgroundJobRecord,
    outcome: JobExecutionTerminalOutcome,
    cancellation_disposition: JobSuccessCancellationDisposition,
) -> dict[str, object]:
    progress_completed = job.progress_total if job.progress_total is not None else job.progress_completed
    return {
        "internal_status": JobInternalStatus.SUCCEEDED,
        "completed_at": outcome.completed_at,
        "next_attempt_at": None,
        "result_reference": outcome.result_reference,
        "continuation_reference": None,
        "error_code": None,
        "error_message": None,
        "error_metadata": None,
        "progress_completed": progress_completed,
        "cancellation_acknowledged_at": (
            outcome.completed_at
            if (
                cancellation_disposition == JobSuccessCancellationDisposition.ACKNOWLEDGE_IF_PRESENT
                and job.cancel_requested_at is not None
            )
            else None
        ),
    }


def failure_job_fields(outcome: JobExecutionTerminalOutcome) -> dict[str, object]:
    return {
        "internal_status": outcome.internal_status,
        "next_attempt_at": outcome.next_attempt_at,
        "completed_at": outcome.completed_at,
        "result_reference": None,
        "continuation_reference": None,
        "error_code": outcome.error_code,
        "error_message": outcome.error_message,
        "error_metadata": outcome.error_metadata,
    }


def cancellation_job_fields(*, outcome: JobExecutionTerminalOutcome) -> dict[str, object]:
    return {
        "internal_status": JobInternalStatus.CANCELLED,
        "completed_at": outcome.completed_at,
        "next_attempt_at": None,
        "result_reference": None,
        "continuation_reference": None,
        "error_code": None,
        "error_message": None,
        "error_metadata": None,
        "cancellation_acknowledged_at": outcome.completed_at,
    }


def interruption_job_fields(*, interruption: JobHandledInterruption) -> dict[str, object]:
    return {
        "internal_status": JobInternalStatus.WAITING_FOR_USER,
        "phase": interruption.phase,
        "status_key": interruption.status_key,
        "completed_at": None,
        "next_attempt_at": None,
        "result_reference": None,
        "continuation_reference": interruption.continuation_reference,
        "error_code": None,
        "error_message": None,
        "error_metadata": None,
    }
