from __future__ import annotations

from datetime import datetime
from math import isfinite

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAuthorityMode,
    JobFailureClassification,
    JobInternalStatus,
    JobRetryClass,
    JobRetryDecision,
    JobRetryHintRejectionReason,
    JobRetryScheduleSource,
    JobWorkloadClass,
)


class BackgroundJobCreate(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_type: str = Field(..., min_length=1, max_length=128)
    job_type_version: int = Field(default=1, ge=1)
    task_name: str = Field(..., min_length=1, max_length=192)
    workload_class: JobWorkloadClass
    authority_mode: JobAuthorityMode = JobAuthorityMode.ACTOR_REVALIDATED
    workspace_id: PublicUUID | None = None
    project_id: PublicUUID | None = None
    site_id: PublicUUID | None = None
    actor_user_id: PublicUUID | None = None
    target_descriptor: JsonObject = Field(default_factory=dict)
    input_reference: JsonObject | None = None
    idempotency_key: str = Field(..., min_length=1, max_length=256)
    source_revision: str | None = Field(default=None, max_length=160)
    correlation_id: str = Field(..., min_length=1, max_length=128)
    trace_id: str | None = Field(default=None, max_length=128)
    retry_class: JobRetryClass = JobRetryClass.NONE
    max_attempts: int = Field(default=1, ge=1)
    timeout_seconds: int | None = Field(default=None, ge=1)
    lease_seconds: int = Field(..., ge=3)
    heartbeat_seconds: int = Field(..., ge=1)
    retry_of_job_id: PublicUUID | None = None
    status_key: str | None = Field(default=None, max_length=160)
    dispatch_after: datetime | None = None

    @field_validator("job_type", "task_name", "idempotency_key", "correlation_id")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must contain non-whitespace characters")
        return normalized

    @field_validator("dispatch_after")
    @classmethod
    def validate_dispatch_after(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("dispatchAfter must include a timezone")
        return value

    @model_validator(mode="after")
    def validate_timing_policy(self) -> BackgroundJobCreate:
        if self.lease_seconds < self.heartbeat_seconds * 3:
            raise ValueError("leaseSeconds must allow at least three heartbeat intervals")
        return self


class BackgroundJobCreateResult(BaseSchema):
    """Result of creating or replaying a durable job inside a transaction."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True, arbitrary_types_allowed=True)

    job: BackgroundJobRecord
    created: bool


class JobDispatchEnvelope(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: PublicUUID
    dispatch_sequence: int = Field(..., ge=1)
    job_type: str = Field(..., min_length=1, max_length=128)
    job_type_version: int = Field(..., ge=1)
    workload_class: JobWorkloadClass
    message_schema_version: int = Field(default=1, ge=1)
    target_descriptor: JsonObject
    request_fingerprint: str = Field(..., min_length=64, max_length=64)


def build_job_dispatch_envelope(
    *,
    job: BackgroundJobRecord,
    dispatch_sequence: int,
) -> JobDispatchEnvelope:
    """Build the only broker-safe delivery envelope from persisted Job state."""

    return JobDispatchEnvelope(
        job_id=job.id,
        dispatch_sequence=dispatch_sequence,
        job_type=job.job_type,
        job_type_version=job.job_type_version,
        workload_class=job.workload_class,
        target_descriptor=job.target_descriptor,
        request_fingerprint=job.request_fingerprint,
    )


class JobDispatchPolicy(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    lease_seconds: int = Field(..., ge=1)
    max_attempts: int = Field(..., ge=1)
    retry_delay_seconds: int = Field(..., ge=1)


class BackgroundJobOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    job_type: str
    job_type_version: int
    task_name: str
    workload_class: JobWorkloadClass
    internal_status: JobInternalStatus
    retry_class: JobRetryClass
    authority_mode: JobAuthorityMode
    workspace_id: PublicUUID | None
    project_id: PublicUUID | None
    site_id: PublicUUID | None
    actor_user_id: PublicUUID | None
    target_descriptor: JsonObject
    input_reference: JsonObject | None
    source_revision: str | None
    correlation_id: str
    trace_id: str | None
    phase: str | None
    status_key: str | None
    progress_completed: int
    progress_total: int | None
    attempt_count: int
    max_attempts: int
    timeout_seconds: int | None
    lease_seconds: int
    heartbeat_seconds: int
    next_attempt_at: datetime | None
    cancel_requested_at: datetime | None
    cancel_requested_by_user_id: PublicUUID | None
    cancel_reason: str | None
    cancellation_acknowledged_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    retry_of_job_id: PublicUUID | None
    result_reference: JsonObject | None
    error_code: str | None
    error_message: str | None
    error_metadata: JsonObject | None
    created_at: datetime
    updated_at: datetime


class BackgroundJobClaim(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: PublicUUID
    worker_id: str = Field(..., min_length=1, max_length=160)
    lease_seconds: int = Field(..., ge=1)


class BackgroundJobSuccess(BaseSchema):
    """Reference to a canonical domain outcome that is already durable."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    result_reference: JsonObject = Field(..., min_length=1)


class BackgroundJobFailure(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    error_code: str = Field(..., min_length=1, max_length=96)
    error_message: str = Field(..., min_length=1, max_length=4000)
    error_metadata: JsonObject | None = None
    failure_classification: JobFailureClassification
    retry_decision: JobRetryDecision
    retry_at: datetime | None = None
    retry_schedule_source: JobRetryScheduleSource | None = None
    retry_delay_seconds: float | None = Field(default=None, ge=0)
    retry_hint_rejection_reason: JobRetryHintRejectionReason | None = None

    @field_validator("retry_delay_seconds")
    @classmethod
    def validate_finite_retry_delay(cls, value: float | None) -> float | None:
        if value is not None and not isfinite(value):
            raise ValueError("retryDelaySeconds must be finite")
        return value

    @model_validator(mode="after")
    def validate_retry_evidence(self) -> BackgroundJobFailure:
        schedule_values = (
            self.retry_at,
            self.retry_schedule_source,
            self.retry_delay_seconds,
        )
        if self.retry_decision == JobRetryDecision.SCHEDULED:
            if any(value is None for value in schedule_values):
                raise ValueError("scheduled retry evidence requires time, source, and delay")
        elif any(value is not None for value in schedule_values):
            raise ValueError("non-scheduled retry evidence cannot contain a schedule")
        if self.retry_schedule_source == JobRetryScheduleSource.PROVIDER_RETRY_AFTER:
            if self.retry_hint_rejection_reason is not None:
                raise ValueError("an honored provider retry hint cannot also be rejected")
        if self.retry_decision in {JobRetryDecision.SCHEDULED, JobRetryDecision.EXHAUSTED} and (
            self.failure_classification
            not in {JobFailureClassification.TRANSIENT, JobFailureClassification.WORKER_LOST}
        ):
            raise ValueError("only transient or worker-loss failures can schedule or exhaust retries")
        return self
