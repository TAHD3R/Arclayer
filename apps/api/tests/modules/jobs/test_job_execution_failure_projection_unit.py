from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

import pytest

from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobFailureClassification,
    JobInternalStatus,
    JobRetryClass,
    JobRetryDecision,
    JobRetryHintRejectionReason,
    JobRetryScheduleSource,
)
from src.modules.jobs.execution_errors import (
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
    WorkerLostJobExecutionError,
)
from src.modules.jobs.execution_terminal_state import build_failure_projection
from src.modules.jobs.retry import JobRetryPolicy

pytestmark = pytest.mark.unit

NOW = datetime(2026, 7, 15, 12, tzinfo=UTC)
RETRYABLE_CODE = "PROVIDER_UNAVAILABLE"


def _subject(
    *,
    attempt_number: int = 1,
    retry_class: JobRetryClass = JobRetryClass.TRANSIENT,
) -> tuple[BackgroundJobRecord, JobAttemptRecord]:
    policy = JobRetryPolicy(
        max_attempts=3,
        initial_delay_seconds=10,
        multiplier=2,
        maximum_delay_seconds=60,
        retryable_codes=frozenset({RETRYABLE_CODE, "BACKGROUND_JOB_WORKER_LOST"}),
    )
    job = BackgroundJobRecord(
        id=uuid4(),
        internal_status=JobInternalStatus.RUNNING,
        retry_class=retry_class,
        retry_policy=policy.model_dump(mode="json", by_alias=True),
        attempt_count=attempt_number,
    )
    attempt = JobAttemptRecord(
        id=uuid4(),
        job_id=job.id,
        dispatch_id=uuid4(),
        attempt_number=attempt_number,
        fencing_token=uuid4(),
        status=JobAttemptStatus.RUNNING,
        worker_id="worker-1",
        handler_version=1,
        claimed_at=NOW,
        lease_until=NOW + timedelta(minutes=1),
        heartbeat_at=NOW,
        started_at=NOW,
    )
    cast(Any, attempt).job_id = job.id
    return job, attempt


def test_scheduled_transient_failure_persists_classification_and_schedule_evidence() -> None:
    job, attempt = _subject()

    projection = build_failure_projection(
        job=job,
        attempt=attempt,
        error=TransientJobExecutionError(
            code=RETRYABLE_CODE,
            safe_message="Provider is temporarily unavailable",
        ),
        database_now=NOW,
        retry_jitter=lambda: 0.5,
    )

    assert projection.outcome.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert projection.failure.failure_classification == JobFailureClassification.TRANSIENT
    assert projection.failure.retry_decision == JobRetryDecision.SCHEDULED
    assert projection.failure.retry_at == NOW + timedelta(seconds=5)
    assert projection.failure.retry_schedule_source == JobRetryScheduleSource.EXPONENTIAL_FULL_JITTER
    assert projection.failure.retry_delay_seconds == 5
    assert projection.failure.retry_hint_rejection_reason is None


def test_exhausted_transient_failure_retains_transient_classification() -> None:
    job, attempt = _subject(attempt_number=3)

    projection = build_failure_projection(
        job=job,
        attempt=attempt,
        error=TransientJobExecutionError(
            code=RETRYABLE_CODE,
            safe_message="Provider is temporarily unavailable",
        ),
        database_now=NOW,
        retry_jitter=lambda: 0.5,
    )

    assert projection.outcome.internal_status == JobInternalStatus.DEAD_LETTERED
    assert projection.failure.failure_classification == JobFailureClassification.TRANSIENT
    assert projection.failure.retry_decision == JobRetryDecision.EXHAUSTED
    assert projection.failure.retry_at is None


def test_non_allowlisted_transient_failure_records_code_not_allowed() -> None:
    job, attempt = _subject()

    projection = build_failure_projection(
        job=job,
        attempt=attempt,
        error=TransientJobExecutionError(
            code="TRANSIENT_CODE_NOT_REGISTERED",
            safe_message="Transient code is not registered",
        ),
        database_now=NOW,
        retry_jitter=lambda: 0.5,
    )

    assert projection.outcome.internal_status == JobInternalStatus.FAILED
    assert projection.failure.failure_classification == JobFailureClassification.TRANSIENT
    assert projection.failure.retry_decision == JobRetryDecision.CODE_NOT_ALLOWED


@pytest.mark.parametrize(
    ("error", "classification"),
    [
        (
            PermanentJobExecutionError(
                code="ASSET_INPUT_INVALID",
                safe_message="Asset input is invalid",
            ),
            JobFailureClassification.PERMANENT,
        ),
        (
            UnexpectedJobExecutionError(),
            JobFailureClassification.UNEXPECTED,
        ),
    ],
)
def test_non_retryable_failures_preserve_their_classification(
    error: PermanentJobExecutionError | UnexpectedJobExecutionError,
    classification: JobFailureClassification,
) -> None:
    job, attempt = _subject()

    projection = build_failure_projection(
        job=job,
        attempt=attempt,
        error=error,
        database_now=NOW,
        retry_jitter=lambda: 0.5,
    )

    assert projection.outcome.internal_status == JobInternalStatus.FAILED
    assert projection.failure.failure_classification == classification
    assert projection.failure.retry_decision == JobRetryDecision.NOT_RETRYABLE


def test_worker_loss_exhaustion_has_distinct_failure_classification() -> None:
    job, attempt = _subject(attempt_number=3)

    projection = build_failure_projection(
        job=job,
        attempt=attempt,
        error=WorkerLostJobExecutionError(),
        database_now=NOW,
        retry_jitter=lambda: 0.5,
    )

    assert projection.outcome.internal_status == JobInternalStatus.DEAD_LETTERED
    assert projection.failure.failure_classification == JobFailureClassification.WORKER_LOST
    assert projection.failure.retry_decision == JobRetryDecision.EXHAUSTED


def test_invalid_provider_hint_records_diagnostic_and_falls_back_to_full_jitter() -> None:
    job, attempt = _subject()

    projection = build_failure_projection(
        job=job,
        attempt=attempt,
        error=TransientJobExecutionError(
            code=RETRYABLE_CODE,
            safe_message="Provider supplied an invalid retry hint",
            provider_retry_after_seconds=10**1000,
        ),
        database_now=NOW,
        retry_jitter=lambda: 0.5,
    )

    assert projection.outcome.internal_status == JobInternalStatus.RETRY_SCHEDULED
    assert projection.failure.retry_schedule_source == JobRetryScheduleSource.EXPONENTIAL_FULL_JITTER
    assert projection.failure.retry_hint_rejection_reason == JobRetryHintRejectionReason.OUT_OF_RANGE
    assert projection.failure.retry_at == NOW + timedelta(seconds=5)


def test_valid_provider_hint_is_persisted_as_schedule_source() -> None:
    job, attempt = _subject()

    projection = build_failure_projection(
        job=job,
        attempt=attempt,
        error=TransientJobExecutionError(
            code=RETRYABLE_CODE,
            safe_message="Provider rate limited the request",
            provider_retry_after_seconds=17,
        ),
        database_now=NOW,
        retry_jitter=lambda: 0,
    )

    assert projection.failure.retry_schedule_source == JobRetryScheduleSource.PROVIDER_RETRY_AFTER
    assert projection.failure.retry_delay_seconds == 17
    assert projection.failure.retry_at == NOW + timedelta(seconds=17)
    assert projection.failure.retry_hint_rejection_reason is None
