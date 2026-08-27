from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import (
    JobAttemptStatus,
    JobFailureClassification,
    JobInternalStatus,
    JobRetryDecision,
    JobWorkloadClass,
)


class PlatformJobListQuery(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    status: JobInternalStatus | None = None
    workload: JobWorkloadClass | None = None
    job_type: str | None = Field(default=None, min_length=1, max_length=128)
    workspace_id: PublicUUID | None = None
    project_id: PublicUUID | None = None
    error_code: str | None = Field(default=None, min_length=1, max_length=96)
    created_from: datetime | None = None
    created_to: datetime | None = None

    @model_validator(mode="after")
    def validate_created_range(self) -> PlatformJobListQuery:
        if self.created_from is not None and self.created_to is not None and self.created_from > self.created_to:
            raise ValueError("createdFrom must not be later than createdTo")
        return self


class PlatformJobQueueOut(BaseSchema):
    """One workload's DB-backed queue snapshot without transport internals."""

    workload: JobWorkloadClass
    stream_name: str
    pending_dispatch_jobs: int = Field(ge=0)
    queued_jobs: int = Field(ge=0)
    running_jobs: int = Field(ge=0)
    retry_scheduled_jobs: int = Field(ge=0)
    waiting_for_user_jobs: int = Field(ge=0)
    failed_jobs_in_window: int = Field(ge=0)
    dead_lettered_jobs_in_window: int = Field(ge=0)
    outbox_in_flight_dispatches: int = Field(ge=0)
    outbox_dead_lettered_dispatches: int = Field(ge=0)
    oldest_backlog_created_at: datetime | None = None
    oldest_backlog_next_attempt_at: datetime | None = None


class PlatformJobQueuesOut(BaseSchema):
    window_hours: int = Field(ge=1)
    queues: list[PlatformJobQueueOut]


class PlatformJobOut(BaseOut):
    """Platform-wide Job projection without transport, lease, or raw provider data."""

    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    job_type: str
    job_type_version: int
    workload: JobWorkloadClass
    status: JobInternalStatus
    workspace_id: PublicUUID | None
    project_id: PublicUUID | None
    site_id: PublicUUID | None
    phase: str | None
    status_key: str | None
    progress_completed: int
    progress_total: int | None
    attempt_count: int
    next_attempt_at: datetime | None
    cancel_requested_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    retry_of_job_id: PublicUUID | None
    error_code: str | None
    correlation_id: str
    created_at: datetime
    updated_at: datetime


class PlatformJobAttemptOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    attempt_number: int
    status: JobAttemptStatus
    worker_id: str
    started_at: datetime
    completed_at: datetime | None
    failure_classification: JobFailureClassification | None
    retry_decision: JobRetryDecision | None
    retry_at: datetime | None
    retry_delay_seconds: float | None
    error_code: str | None
    error_message: str | None


class PlatformJobDetailOut(PlatformJobOut):
    error_message: str | None
    attempts: list[PlatformJobAttemptOut]
