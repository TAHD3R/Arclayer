from __future__ import annotations

from datetime import datetime, timedelta

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobInternalStatus,
)
from src.modules.jobs.execution_errors import JobExecutionLeaseLostError
from src.modules.jobs.execution_registry import JobTypeRegistration
from src.modules.jobs.execution_schema import (
    JobDeliveryClaim,
    JobDeliveryDisposition,
    JobExecutionControlSnapshot,
    JobExecutionLease,
)
from src.modules.jobs.schema import JobDispatchEnvelope


def validate_execution_binding(
    *,
    registration: JobTypeRegistration,
    job: BackgroundJobRecord,
    dispatch: JobDispatchOutboxRecord,
    task_name: str,
    envelope: JobDispatchEnvelope,
) -> None:
    is_exact = (
        registration.job_type == job.job_type == envelope.job_type
        and registration.job_type_version == job.job_type_version == envelope.job_type_version
        and registration.task_name == task_name == job.task_name == dispatch.task_name
        and registration.workload_class == job.workload_class == dispatch.workload_class == envelope.workload_class
        and registration.message_schema_version == dispatch.message_schema_version == envelope.message_schema_version
    )
    if not is_exact:
        raise envelope_mismatch()


def build_terminal_duplicate(*, job: BackgroundJobRecord, dispatch_sequence: int) -> JobDeliveryClaim:
    return JobDeliveryClaim(
        job_id=job.id,
        dispatch_sequence=dispatch_sequence,
        disposition=JobDeliveryDisposition.TERMINAL_DUPLICATE,
        terminal_status=job.internal_status,
    )


def validate_execution_fence(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    lease: JobExecutionLease,
    observed_at: datetime,
) -> None:
    matches = execution_identity_matches(job=job, attempt=attempt, lease=lease)
    is_running = job.internal_status == JobInternalStatus.RUNNING and attempt.status == JobAttemptStatus.RUNNING
    clock_is_monotonic = observed_at >= attempt.heartbeat_at
    if (
        not matches
        or not is_running
        or not clock_is_monotonic
        or attempt_is_expired(attempt=attempt, observed_at=observed_at)
    ):
        raise JobExecutionLeaseLostError(
            job_id=job.id,
            attempt_id=attempt.id,
            reason="Attempt fence is stale or its execution lease has expired",
        )


def build_execution_control_snapshot(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    lease: JobExecutionLease,
    observed_at: datetime,
) -> JobExecutionControlSnapshot:
    """Validate one locked Job/Attempt fence and derive its renewed lease."""

    validate_execution_fence(
        job=job,
        attempt=attempt,
        lease=lease,
        observed_at=observed_at,
    )
    renewed_until = observed_at + timedelta(seconds=job.lease_seconds)
    if attempt.timeout_at is not None:
        renewed_until = min(renewed_until, attempt.timeout_at)
    return JobExecutionControlSnapshot(
        job_id=job.id,
        attempt_id=attempt.id,
        fencing_token=attempt.fencing_token,
        observed_at=observed_at,
        lease_until=renewed_until,
        timeout_at=attempt.timeout_at,
        cancel_requested_at=job.cancel_requested_at,
        cancel_requested_by_user_id=job.cancel_requested_by_user_id,
        cancel_reason=job.cancel_reason,
    )


def execution_identity_matches(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    lease: JobExecutionLease,
) -> bool:
    return (
        attempt.id == lease.attempt_id
        and attempt.job_id == job.id == lease.job_id
        and attempt.attempt_number == lease.attempt_number
        and attempt.attempt_number == job.attempt_count
        and attempt.worker_id == lease.worker_id
        and attempt.fencing_token == lease.fencing_token
        and attempt.handler_version == job.job_type_version == lease.job_type_version
        and lease.job_type == job.job_type
        and lease.workload_class == job.workload_class
    )


def attempt_is_expired(*, attempt: JobAttemptRecord, observed_at: datetime) -> bool:
    return attempt.lease_until <= observed_at or (attempt.timeout_at is not None and attempt.timeout_at <= observed_at)


def to_execution_lease(
    *,
    job: BackgroundJobRecord,
    attempt: JobAttemptRecord,
    dispatch_sequence: int,
) -> JobExecutionLease:
    return JobExecutionLease(
        job_id=job.id,
        attempt_id=attempt.id,
        dispatch_sequence=dispatch_sequence,
        attempt_number=attempt.attempt_number,
        worker_id=attempt.worker_id,
        fencing_token=attempt.fencing_token,
        job_type=job.job_type,
        job_type_version=job.job_type_version,
        workload_class=job.workload_class,
        claimed_at=attempt.claimed_at,
        lease_until=attempt.lease_until,
        timeout_at=attempt.timeout_at,
    )


def envelope_mismatch() -> Conflict:
    return Conflict(
        message=t("errors", "BACKGROUND_JOB_DISPATCH_ENVELOPE_MISMATCH"),
        error="BACKGROUND_JOB_DISPATCH_ENVELOPE_MISMATCH",
    )


def not_claimable() -> Conflict:
    return Conflict(
        message=t("errors", "BACKGROUND_JOB_NOT_CLAIMABLE"),
        error="BACKGROUND_JOB_NOT_CLAIMABLE",
    )
