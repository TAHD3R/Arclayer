from __future__ import annotations

from pydantic import AwareDatetime, ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobInternalStatus


class JobLeaseReapCandidate(BaseSchema):
    """Unlocked, bounded discovery result; ownership is revalidated under row locks."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: PublicUUID
    attempt_id: PublicUUID
    lease_until: AwareDatetime


class JobLeaseReapOutcome(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    job_id: PublicUUID
    attempt_id: PublicUUID
    internal_status: JobInternalStatus
    retry_at: AwareDatetime | None = None
    is_replay: bool = False

    @model_validator(mode="after")
    def validate_status(self) -> JobLeaseReapOutcome:
        if self.internal_status == JobInternalStatus.RETRY_SCHEDULED:
            if self.retry_at is None:
                raise ValueError("retry-scheduled reaps require retryAt")
            return self
        if self.internal_status != JobInternalStatus.DEAD_LETTERED or self.retry_at is not None:
            raise ValueError("lease reaps must retry or dead-letter the Job")
        return self


class JobLeaseReapBatch(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    scanned_count: int = Field(..., ge=0)
    outcomes: tuple[JobLeaseReapOutcome, ...]

    @property
    def reaped_count(self) -> int:
        return len(self.outcomes)

    @property
    def retry_scheduled_count(self) -> int:
        return sum(outcome.internal_status == JobInternalStatus.RETRY_SCHEDULED for outcome in self.outcomes)

    @property
    def dead_lettered_count(self) -> int:
        return sum(outcome.internal_status == JobInternalStatus.DEAD_LETTERED for outcome in self.outcomes)
