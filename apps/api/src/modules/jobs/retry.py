from __future__ import annotations

from datetime import datetime, timedelta
from enum import StrEnum
from math import isfinite
from re import fullmatch

from pydantic import ConfigDict, Field, field_serializer, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.models.jobs.background_job import (
    JobRetryHintRejectionReason,
    JobRetryScheduleSource,
)


class JobRetryJitterStrategy(StrEnum):
    FULL = "full"


class JobRetryPolicy(BaseSchema):
    """Immutable automatic-retry policy snapshotted onto a durable Job."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    max_attempts: int = Field(..., ge=1)
    initial_delay_seconds: float = Field(..., gt=0)
    multiplier: float = Field(..., gt=1)
    maximum_delay_seconds: float = Field(..., gt=0)
    jitter_strategy: JobRetryJitterStrategy = JobRetryJitterStrategy.FULL
    retryable_codes: frozenset[str] = Field(default_factory=frozenset)

    @field_validator("initial_delay_seconds", "multiplier", "maximum_delay_seconds")
    @classmethod
    def validate_finite_number(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("retry policy numbers must be finite")
        return value

    @field_validator("retryable_codes")
    @classmethod
    def validate_retryable_codes(cls, values: frozenset[str]) -> frozenset[str]:
        normalized = frozenset(value.strip() for value in values)
        if len(normalized) != len(values) or any(
            fullmatch(r"[A-Z][A-Z0-9_]{0,95}", value) is None for value in normalized
        ):
            raise ValueError("retryableCodes must contain unique stable uppercase error codes")
        return normalized

    @field_serializer("retryable_codes")
    def serialize_retryable_codes(self, values: frozenset[str]) -> list[str]:
        """Keep persisted snapshots and fingerprints stable across processes."""

        return sorted(values)

    @model_validator(mode="after")
    def validate_delay_window(self) -> JobRetryPolicy:
        if self.maximum_delay_seconds < self.initial_delay_seconds:
            raise ValueError("maximumDelaySeconds must be greater than or equal to initialDelaySeconds")
        return self


class JobRetrySchedule(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    retry_at: datetime
    delay_seconds: float = Field(..., ge=0)
    source: JobRetryScheduleSource

    @field_validator("retry_at")
    @classmethod
    def validate_retry_at_timezone(cls, value: datetime) -> datetime:
        if value.utcoffset() is None:
            raise ValueError("retryAt must be timezone-aware")
        return value


class JobRetryCalculation(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    schedule: JobRetrySchedule | None
    provider_hint_rejection_reason: JobRetryHintRejectionReason | None = None


def evaluate_retry_schedule(
    *,
    policy: JobRetryPolicy,
    completed_attempt_number: int,
    error_code: str,
    now: datetime,
    jitter_ratio: float,
    provider_retry_after_seconds: object | None = None,
) -> JobRetryCalculation:
    """Evaluate a registry-owned schedule and retain invalid-hint diagnostics."""

    if completed_attempt_number < 1:
        raise ValueError("completedAttemptNumber must be positive")
    if now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    if not 0 <= jitter_ratio <= 1 or not isfinite(jitter_ratio):
        raise ValueError("jitterRatio must be a finite number between 0 and 1")
    provider_delay, rejection_reason = _validated_provider_delay(
        value=provider_retry_after_seconds,
        now=now,
    )
    if completed_attempt_number >= policy.max_attempts or error_code not in policy.retryable_codes:
        return JobRetryCalculation(
            schedule=None,
            provider_hint_rejection_reason=rejection_reason,
        )

    if provider_delay is not None:
        delay_seconds = provider_delay
        source = JobRetryScheduleSource.PROVIDER_RETRY_AFTER
    else:
        delay_cap = _exponential_delay_cap(policy=policy, completed_attempt_number=completed_attempt_number)
        delay_seconds = delay_cap * jitter_ratio
        source = JobRetryScheduleSource.EXPONENTIAL_FULL_JITTER

    return JobRetryCalculation(
        schedule=JobRetrySchedule(
            retry_at=now + timedelta(seconds=delay_seconds),
            delay_seconds=delay_seconds,
            source=source,
        ),
        provider_hint_rejection_reason=rejection_reason,
    )


def _validated_provider_delay(
    *,
    value: object | None,
    now: datetime,
) -> tuple[int | float | None, JobRetryHintRejectionReason | None]:
    if value is None:
        return None, None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None, JobRetryHintRejectionReason.INVALID_TYPE
    if value <= 0:
        return None, JobRetryHintRejectionReason.NON_POSITIVE
    if isinstance(value, float) and not isfinite(value):
        return None, JobRetryHintRejectionReason.NON_FINITE
    try:
        now + timedelta(seconds=value)
    except (OverflowError, TypeError, ValueError):
        return None, JobRetryHintRejectionReason.OUT_OF_RANGE
    return value, None


def _exponential_delay_cap(*, policy: JobRetryPolicy, completed_attempt_number: int) -> float:
    try:
        uncapped = policy.initial_delay_seconds * policy.multiplier ** (completed_attempt_number - 1)
    except OverflowError:
        return policy.maximum_delay_seconds
    return min(policy.maximum_delay_seconds, uncapped)
