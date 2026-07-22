from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import AwareDatetime, ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import (
    JobAuthorityMode,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.modules.jobs.reaper_schema import JobLeaseReapOutcome
from src.modules.jobs.schema import JobDispatchEnvelope
from src.modules.tenancy.schema import TenantContext, TenantScope

_TERMINAL_JOB_STATUSES = frozenset({
    JobInternalStatus.SUCCEEDED,
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
})


class JobDeliveryDisposition(StrEnum):
    """Executor action for one validated at-least-once transport delivery."""

    CLAIMED = "claimed"
    TERMINAL_DUPLICATE = "terminal_duplicate"
    ACTIVE_ATTEMPT_DUPLICATE = "active_attempt_duplicate"
    CANCELLED_BEFORE_ATTEMPT = "cancelled_before_attempt"
    STALE_DELIVERY = "stale_delivery"
    LEASE_REAP_REQUIRED = "lease_reap_required"


class JobSuccessCancellationDisposition(StrEnum):
    """Explicit worker evidence for a cancellation request observed after success."""

    REQUIRE_NONE = "require_none"
    ACKNOWLEDGE_IF_PRESENT = "acknowledge_if_present"


class SystemExecutionBinding(BaseSchema):
    """Explicit proof that one registered system Job needs no tenant routing."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    binding_type: Literal["system"] = "system"


class TenantExecutionBinding(BaseSchema):
    """Canonical tenant route resolved for one tenant-owned Job execution."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    binding_type: Literal["tenant"] = "tenant"
    tenant_context: TenantContext

    @model_validator(mode="after")
    def validate_job_scope(self) -> TenantExecutionBinding:
        if self.tenant_context.scope != TenantScope.JOB:
            raise ValueError("tenant execution bindings require TenantScope.JOB")
        return self


type JobExecutionBinding = SystemExecutionBinding | TenantExecutionBinding


class JobDeliveryCommand(BaseSchema):
    """Trusted worker metadata plus the only broker-delivered Job payload."""

    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    task_name: str = Field(..., min_length=1, max_length=192)
    envelope: JobDispatchEnvelope
    worker_id: str = Field(..., min_length=1, max_length=160)
    transport_message_id: str = Field(..., min_length=1, max_length=192)
    received_at: AwareDatetime = Field(
        ...,
        description="Diagnostic transport receipt time; never an execution-authority clock.",
    )

    @field_validator("task_name", "worker_id", "transport_message_id")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must contain non-whitespace characters")
        return normalized


class JobExecutionLease(BaseSchema):
    """Attempt-scoped authority required for every execution mutation."""

    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    job_id: PublicUUID
    attempt_id: PublicUUID
    dispatch_sequence: int = Field(..., ge=1)
    attempt_number: int = Field(..., ge=1)
    worker_id: str = Field(..., min_length=1, max_length=160)
    fencing_token: PublicUUID
    job_type: str = Field(..., min_length=1, max_length=128)
    job_type_version: int = Field(..., ge=1)
    workload_class: JobWorkloadClass
    claimed_at: AwareDatetime
    lease_until: AwareDatetime
    timeout_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_deadlines(self) -> JobExecutionLease:
        if self.attempt_number != self.dispatch_sequence:
            raise ValueError("attemptNumber must match dispatchSequence")
        if self.lease_until <= self.claimed_at:
            raise ValueError("leaseUntil must be after claimedAt")
        if self.timeout_at is not None and self.timeout_at <= self.claimed_at:
            raise ValueError("timeoutAt must be after claimedAt")
        if self.timeout_at is not None and self.lease_until > self.timeout_at:
            raise ValueError("leaseUntil cannot exceed timeoutAt")
        return self


class JobDeliveryClaim(BaseSchema):
    """Atomic delivery acceptance outcome; only ``claimed`` grants a new lease."""

    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    job_id: PublicUUID
    dispatch_sequence: int = Field(..., ge=1)
    disposition: JobDeliveryDisposition
    lease: JobExecutionLease | None = None
    terminal_status: JobInternalStatus | None = None
    active_attempt_id: PublicUUID | None = None

    @model_validator(mode="after")
    def validate_disposition(self) -> JobDeliveryClaim:
        disposition = JobDeliveryDisposition(self.disposition)
        if disposition == JobDeliveryDisposition.CLAIMED:
            self._validate_claimed_lease()
            return self

        if self.lease is not None:
            raise ValueError("non-claimed deliveries cannot grant an execution lease")
        if disposition in {
            JobDeliveryDisposition.ACTIVE_ATTEMPT_DUPLICATE,
            JobDeliveryDisposition.LEASE_REAP_REQUIRED,
        }:
            if self.active_attempt_id is None or self.terminal_status is not None:
                raise ValueError("Attempt-referenced deliveries require only activeAttemptId")
            return self

        if disposition == JobDeliveryDisposition.STALE_DELIVERY:
            if self.active_attempt_id is not None or self.terminal_status is not None:
                raise ValueError("stale deliveries cannot carry Attempt or terminal state")
            return self

        if self.active_attempt_id is not None or self.terminal_status not in _TERMINAL_JOB_STATUSES:
            raise ValueError("terminal delivery dispositions require only a terminal status")
        if (
            disposition == JobDeliveryDisposition.CANCELLED_BEFORE_ATTEMPT
            and self.terminal_status != JobInternalStatus.CANCELLED
        ):
            raise ValueError("cancelled-before-attempt deliveries require cancelled terminal status")
        return self

    def _validate_claimed_lease(self) -> None:
        if self.lease is None or self.terminal_status is not None or self.active_attempt_id is not None:
            raise ValueError("claimed deliveries require only a new execution lease")
        if self.lease.job_id != self.job_id or self.lease.dispatch_sequence != self.dispatch_sequence:
            raise ValueError("delivery claim and execution lease identities must match")


class JobExecutionControlSnapshot(BaseSchema):
    """Current fenced lease, deadline, and cooperative cancellation state."""

    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    job_id: PublicUUID
    attempt_id: PublicUUID
    fencing_token: PublicUUID
    observed_at: AwareDatetime
    lease_until: AwareDatetime
    timeout_at: AwareDatetime | None = None
    cancel_requested_at: AwareDatetime | None = None
    cancel_requested_by_user_id: PublicUUID | None = None
    cancel_reason: str | None = Field(default=None, max_length=512)

    @model_validator(mode="after")
    def validate_control_state(self) -> JobExecutionControlSnapshot:
        if self.lease_until <= self.observed_at:
            raise ValueError("a control snapshot cannot grant an expired lease")
        if self.timeout_at is not None and self.timeout_at <= self.observed_at:
            raise ValueError("a control snapshot cannot grant an expired timeout")
        if self.timeout_at is not None and self.lease_until > self.timeout_at:
            raise ValueError("a control snapshot lease cannot exceed timeoutAt")
        if self.cancel_requested_at is None and (
            self.cancel_requested_by_user_id is not None or self.cancel_reason is not None
        ):
            raise ValueError("cancellation details require cancelRequestedAt")
        return self

    @property
    def cancellation_requested(self) -> bool:
        return self.cancel_requested_at is not None


class JobExecutionPreparation(BaseSchema):
    """Fenced canonical Job snapshot used to construct one handler context."""

    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    lease: JobExecutionLease
    target_descriptor: JsonObject
    input_reference: JsonObject
    source_revision: str | None = Field(default=None, max_length=160)
    request_fingerprint: str = Field(..., min_length=64, max_length=64)
    correlation_id: str = Field(..., min_length=1, max_length=128)
    actor_user_id: PublicUUID | None = None
    authority_mode: JobAuthorityMode
    phase: str = Field(..., min_length=1, max_length=96)
    control: JobExecutionControlSnapshot


class JobProgressUpdate(BaseSchema):
    """Absolute durable progress; values never represent increments or deltas."""

    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    phase: str = Field(..., min_length=1, max_length=96)
    status_key: str | None = Field(default=None, min_length=1, max_length=160)
    progress_completed: int = Field(..., ge=0)
    progress_total: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_absolute_progress(self) -> JobProgressUpdate:
        if self.progress_total is not None and self.progress_completed > self.progress_total:
            raise ValueError("progressCompleted cannot exceed progressTotal")
        return self


class JobExecutionTerminalOutcome(BaseSchema):
    """Validated durable projection produced when one fenced Attempt stops running."""

    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    job_id: PublicUUID
    attempt_id: PublicUUID
    internal_status: JobInternalStatus
    completed_at: AwareDatetime | None = None
    next_attempt_at: AwareDatetime | None = None
    result_reference: JsonObject | None = None
    continuation_reference: JsonObject | None = None
    error_code: str | None = Field(default=None, min_length=1, max_length=96)
    error_message: str | None = Field(default=None, min_length=1, max_length=4000)
    error_metadata: JsonObject | None = None
    is_replay: bool = False

    @model_validator(mode="after")
    def validate_terminal_projection(self) -> JobExecutionTerminalOutcome:
        status = JobInternalStatus(self.internal_status)
        if status == JobInternalStatus.WAITING_FOR_USER:
            if (
                self.continuation_reference is None
                or self.completed_at is not None
                or self.next_attempt_at is not None
                or self.result_reference is not None
                or self.error_code is not None
                or self.error_message is not None
                or self.error_metadata is not None
            ):
                raise ValueError("waiting-for-user outcomes require only continuation evidence")
            return self
        if self.continuation_reference is not None:
            raise ValueError("only waiting-for-user outcomes may carry continuation evidence")
        if status == JobInternalStatus.RETRY_SCHEDULED:
            if (
                self.next_attempt_at is None
                or self.completed_at is not None
                or self.result_reference is not None
                or self.error_code is None
                or self.error_message is None
            ):
                raise ValueError("retry-scheduled outcomes require only retry and error evidence")
            return self
        if status not in _TERMINAL_JOB_STATUSES or self.completed_at is None or self.next_attempt_at is not None:
            raise ValueError("terminal outcomes require a terminal status and completedAt")
        if status == JobInternalStatus.SUCCEEDED:
            if (
                self.result_reference is None
                or self.error_code is not None
                or self.error_message is not None
                or self.error_metadata is not None
            ):
                raise ValueError("succeeded outcomes require only a result reference")
            return self
        if self.result_reference is not None:
            raise ValueError("non-success outcomes cannot contain a result reference")
        if status == JobInternalStatus.CANCELLED:
            if self.error_code is not None or self.error_message is not None or self.error_metadata is not None:
                raise ValueError("cancelled outcomes cannot contain failure evidence")
            return self
        if self.error_code is None or self.error_message is None:
            raise ValueError("failed outcomes require error evidence")
        return self


class DurableJobExecutionOutcome(BaseSchema):
    """Non-authoritative worker diagnostic returned only after durable recovery."""

    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    delivery: JobDeliveryClaim
    terminal: JobExecutionTerminalOutcome | None = None
    lease_reap: JobLeaseReapOutcome | None = None

    @model_validator(mode="after")
    def validate_durable_outcome(self) -> DurableJobExecutionOutcome:
        disposition = JobDeliveryDisposition(self.delivery.disposition)
        if disposition == JobDeliveryDisposition.CLAIMED:
            self._validate_claimed_outcome()
            return self
        if disposition == JobDeliveryDisposition.LEASE_REAP_REQUIRED:
            self._validate_lease_reap_outcome()
            return self
        if self.terminal is not None or self.lease_reap is not None:
            raise ValueError("non-executing deliveries cannot carry terminal or lease-reap outcomes")
        return self

    def _validate_claimed_outcome(self) -> None:
        if self.terminal is None or self.lease_reap is not None or self.delivery.lease is None:
            raise ValueError("claimed deliveries require only a terminal outcome")
        if self.terminal.job_id != self.delivery.job_id or self.terminal.attempt_id != self.delivery.lease.attempt_id:
            raise ValueError("terminal outcome must match the claimed Job and Attempt")

    def _validate_lease_reap_outcome(self) -> None:
        if self.lease_reap is None or self.terminal is not None or self.delivery.active_attempt_id is None:
            raise ValueError("expired deliveries require only a confirmed lease-reap outcome")
        if (
            self.lease_reap.job_id != self.delivery.job_id
            or self.lease_reap.attempt_id != self.delivery.active_attempt_id
        ):
            raise ValueError("lease-reap outcome must match the expired Job and Attempt")
