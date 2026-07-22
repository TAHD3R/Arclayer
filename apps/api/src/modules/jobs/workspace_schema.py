from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobWorkloadClass


class JobPublicStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_FOR_USER = "waiting_for_user"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class WorkspaceJobListQuery(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    status: JobPublicStatus | None = None
    job_type: str | None = Field(default=None, min_length=1, max_length=128)
    workload: JobWorkloadClass | None = None
    project_id: PublicUUID | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None

    @model_validator(mode="after")
    def validate_created_range(self) -> WorkspaceJobListQuery:
        if self.created_from is not None and self.created_to is not None and self.created_from > self.created_to:
            raise ValueError("createdFrom must not be later than createdTo")
        return self


class WorkspaceJobCancelRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    reason: str | None = Field(default=None, max_length=512)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class WorkspaceJobOut(BaseOut):
    """Workspace-safe Job projection without transport, lease, or raw provider data."""

    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    job_type: str
    job_type_version: int
    workload: JobWorkloadClass
    status: JobPublicStatus
    project_id: PublicUUID | None
    site_id: PublicUUID | None
    phase: str | None
    status_key: str | None
    progress_completed: int
    progress_total: int | None
    cancel_requested_at: datetime | None
    cancellation_acknowledged_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    retry_of_job_id: PublicUUID | None
    error_code: str | None
    has_result: bool
    created_at: datetime
    updated_at: datetime
