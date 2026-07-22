from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobRetryHintRejectionReason,
    JobRetryScheduleSource,
)
from src.modules.jobs.retry import (
    JobRetryPolicy,
    evaluate_retry_schedule,
)


def _policy(**updates: object) -> JobRetryPolicy:
    values: dict[str, object] = {
        "max_attempts": 4,
        "initial_delay_seconds": 10,
        "multiplier": 2,
        "maximum_delay_seconds": 30,
        "retryable_codes": frozenset({"PROVIDER_UNAVAILABLE", "PROVIDER_RATE_LIMITED"}),
    }
    values.update(updates)
    return JobRetryPolicy.model_validate(values)


def test_retry_policy_is_strict_frozen_and_validates_delay_window() -> None:
    with pytest.raises(ValidationError, match="maximumDelaySeconds"):
        _policy(initial_delay_seconds=31)
    with pytest.raises(ValidationError, match="retryableCodes"):
        _policy(retryable_codes={"provider-unavailable"})
    with pytest.raises(ValidationError, match="extra_forbidden"):
        JobRetryPolicy.model_validate(_policy().model_dump() | {"retry_cap": 99})
    with pytest.raises(ValidationError, match="frozen_instance"):
        _policy().max_attempts = 10


def test_retry_policy_serializes_as_the_canonical_camel_case_snapshot() -> None:
    serialized = _policy().model_dump(mode="json", by_alias=True)

    assert serialized == {
        "maxAttempts": 4,
        "initialDelaySeconds": 10.0,
        "multiplier": 2.0,
        "maximumDelaySeconds": 30.0,
        "jitterStrategy": "full",
        "retryableCodes": ["PROVIDER_RATE_LIMITED", "PROVIDER_UNAVAILABLE"],
    }


def test_background_job_max_attempts_strictly_parses_its_retry_policy_snapshot() -> None:
    job = BackgroundJobRecord(retry_policy=_policy().model_dump(mode="json", by_alias=True))
    invalid_job = BackgroundJobRecord(retry_policy={"maxAttempts": 0})

    assert job.max_attempts == 4
    with pytest.raises(ValidationError):
        _ = invalid_job.max_attempts


def test_retry_schedule_uses_exponential_full_jitter() -> None:
    now = datetime(2026, 7, 15, 12, tzinfo=UTC)

    first = evaluate_retry_schedule(
        policy=_policy(),
        completed_attempt_number=1,
        error_code="PROVIDER_UNAVAILABLE",
        now=now,
        jitter_ratio=0.25,
    )
    third = evaluate_retry_schedule(
        policy=_policy(),
        completed_attempt_number=3,
        error_code="PROVIDER_UNAVAILABLE",
        now=now,
        jitter_ratio=1,
    )

    assert first.schedule is not None
    assert first.schedule.source == JobRetryScheduleSource.EXPONENTIAL_FULL_JITTER
    assert first.schedule.delay_seconds == 2.5
    assert first.schedule.retry_at == now + timedelta(seconds=2.5)
    assert third.schedule is not None
    assert third.schedule.delay_seconds == 30


def test_retry_schedule_honors_valid_provider_retry_after() -> None:
    now = datetime(2026, 7, 15, 12, tzinfo=UTC)

    calculation = evaluate_retry_schedule(
        policy=_policy(),
        completed_attempt_number=1,
        error_code="PROVIDER_RATE_LIMITED",
        now=now,
        jitter_ratio=0,
        provider_retry_after_seconds=90,
    )

    assert calculation.schedule is not None
    assert calculation.schedule.source == JobRetryScheduleSource.PROVIDER_RETRY_AFTER
    assert calculation.schedule.delay_seconds == 90
    assert calculation.schedule.retry_at == now + timedelta(seconds=90)
    assert calculation.provider_hint_rejection_reason is None


@pytest.mark.parametrize(
    ("attempt_number", "error_code"),
    [
        (4, "PROVIDER_UNAVAILABLE"),
        (1, "VALIDATION_FAILED"),
    ],
)
def test_retry_schedule_returns_none_for_exhausted_or_non_allowlisted_failure(
    attempt_number: int,
    error_code: str,
) -> None:
    assert (
        evaluate_retry_schedule(
            policy=_policy(),
            completed_attempt_number=attempt_number,
            error_code=error_code,
            now=datetime(2026, 7, 15, 12, tzinfo=UTC),
            jitter_ratio=0.5,
        ).schedule
        is None
    )


@pytest.mark.parametrize("jitter_ratio", [-0.01, 1.01, float("inf")])
def test_retry_schedule_rejects_invalid_jitter(jitter_ratio: float) -> None:
    with pytest.raises(ValueError, match="jitterRatio"):
        evaluate_retry_schedule(
            policy=_policy(),
            completed_attempt_number=1,
            error_code="PROVIDER_UNAVAILABLE",
            now=datetime(2026, 7, 15, 12, tzinfo=UTC),
            jitter_ratio=jitter_ratio,
        )


def test_retry_schedule_rejects_naive_clock() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        evaluate_retry_schedule(
            policy=_policy(),
            completed_attempt_number=1,
            error_code="PROVIDER_UNAVAILABLE",
            now=datetime(2026, 7, 15, 12),
            jitter_ratio=0.5,
        )


@pytest.mark.parametrize(
    ("provider_hint", "expected_reason"),
    [
        (0, JobRetryHintRejectionReason.NON_POSITIVE),
        (float("inf"), JobRetryHintRejectionReason.NON_FINITE),
        (10**1000, JobRetryHintRejectionReason.OUT_OF_RANGE),
        ("120", JobRetryHintRejectionReason.INVALID_TYPE),
    ],
)
def test_invalid_provider_hint_records_reason_and_uses_full_jitter(
    provider_hint: object,
    expected_reason: JobRetryHintRejectionReason,
) -> None:
    now = datetime(2026, 7, 15, 12, tzinfo=UTC)

    calculation = evaluate_retry_schedule(
        policy=_policy(),
        completed_attempt_number=1,
        error_code="PROVIDER_UNAVAILABLE",
        now=now,
        jitter_ratio=0.5,
        provider_retry_after_seconds=provider_hint,
    )

    assert calculation.provider_hint_rejection_reason == expected_reason
    assert calculation.schedule is not None
    assert calculation.schedule.source == JobRetryScheduleSource.EXPONENTIAL_FULL_JITTER
    assert calculation.schedule.retry_at == now + timedelta(seconds=5)
