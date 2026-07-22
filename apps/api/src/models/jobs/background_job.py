from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class JobWorkloadClass(StrEnum):
    AGENT_IO = "agent-io"
    RENDER_BROWSER = "render-browser"
    ASSET_CPU = "asset-cpu"
    PUBLISH = "publish"
    CONNECTOR = "connector"
    MAINTENANCE = "maintenance"


class JobInternalStatus(StrEnum):
    PENDING_DISPATCH = "pending_dispatch"
    QUEUED = "queued"
    RUNNING = "running"
    RETRY_SCHEDULED = "retry_scheduled"
    WAITING_FOR_USER = "waiting_for_user"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DEAD_LETTERED = "dead_lettered"
    CANCELLED = "cancelled"


class JobRetryClass(StrEnum):
    NONE = "none"
    TRANSIENT = "transient"


class JobFailureClassification(StrEnum):
    PERMANENT = "permanent"
    TRANSIENT = "transient"
    UNEXPECTED = "unexpected"
    WORKER_LOST = "worker_lost"


class JobRetryDecision(StrEnum):
    SCHEDULED = "scheduled"
    EXHAUSTED = "exhausted"
    CODE_NOT_ALLOWED = "code_not_allowed"
    NOT_RETRYABLE = "not_retryable"


class JobRetryScheduleSource(StrEnum):
    EXPONENTIAL_FULL_JITTER = "exponential_full_jitter"
    PROVIDER_RETRY_AFTER = "provider_retry_after"


class JobRetryHintRejectionReason(StrEnum):
    INVALID_TYPE = "invalid_type"
    NON_POSITIVE = "non_positive"
    NON_FINITE = "non_finite"
    OUT_OF_RANGE = "out_of_range"


class JobAuthorityMode(StrEnum):
    ACTOR_REVALIDATED = "actor_revalidated"
    SYSTEM_SERVICE = "system_service"


class JobAttemptStatus(StrEnum):
    CLAIMED = "claimed"
    RUNNING = "running"
    INTERRUPTED = "interrupted"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    LEASE_EXPIRED = "lease_expired"


class JobDispatchStatus(StrEnum):
    PENDING = "pending"
    DISPATCHING = "dispatching"
    DISPATCHED = "dispatched"
    RETRY_SCHEDULED = "retry_scheduled"
    DEAD_LETTERED = "dead_lettered"


class BackgroundJobRecord(BaseModel):
    """Durable business state for asynchronous platform work."""

    job_type = fields.CharField(max_length=128, db_index=True)
    job_type_version = fields.IntField(default=1)
    task_name = fields.CharField(max_length=192)
    workload_class = fields.CharEnumField(JobWorkloadClass, max_length=32, db_index=True)
    internal_status = fields.CharEnumField(
        JobInternalStatus,
        max_length=32,
        default=JobInternalStatus.PENDING_DISPATCH,
        db_index=True,
    )
    retry_class = fields.CharEnumField(
        JobRetryClass,
        max_length=16,
        default=JobRetryClass.NONE,
    )
    authority_mode = fields.CharEnumField(
        JobAuthorityMode,
        max_length=24,
        default=JobAuthorityMode.ACTOR_REVALIDATED,
    )

    workspace_id = fields.UUIDField(null=True, db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    site_id = fields.UUIDField(null=True, db_index=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    target_descriptor = fields.JSONField(default=dict)
    input_reference = fields.JSONField(null=True)

    idempotency_scope_key = fields.CharField(max_length=192, db_index=True)
    idempotency_key_hash = fields.CharField(max_length=64, unique=True)
    request_fingerprint = fields.CharField(max_length=64)
    source_revision = fields.CharField(max_length=160, null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, db_index=True)
    trace_id = fields.CharField(max_length=128, null=True, db_index=True)

    phase = fields.CharField(max_length=96, null=True)
    status_key = fields.CharField(max_length=160, null=True)
    progress_completed = fields.IntField(default=0)
    progress_total = fields.IntField(null=True)

    attempt_count = fields.IntField(default=0)
    retry_policy = fields.JSONField()
    timeout_seconds = fields.IntField(null=True)
    lease_seconds = fields.IntField()
    heartbeat_seconds = fields.IntField()
    next_attempt_at = fields.DatetimeField(null=True, db_index=True)
    cancel_requested_at = fields.DatetimeField(null=True, db_index=True)
    cancel_requested_by_user_id = fields.UUIDField(null=True)
    cancel_reason = fields.CharField(max_length=512, null=True)
    cancellation_acknowledged_at = fields.DatetimeField(null=True)
    started_at = fields.DatetimeField(null=True)
    completed_at = fields.DatetimeField(null=True)
    retry_of_job_id = fields.UUIDField(null=True, db_index=True)

    result_reference = fields.JSONField(null=True)
    continuation_reference = fields.JSONField(null=True)
    error_code = fields.CharField(max_length=96, null=True)
    error_message = fields.TextField(null=True)
    error_metadata = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "background_jobs"
        table_description = "Durable business state for asynchronous platform work."
        abstract = False
        indexes = (
            ("internal_status", "next_attempt_at"),
            ("workload_class", "internal_status", "created_at"),
            ("workspace_id", "created_at"),
        )

    @property
    def max_attempts(self) -> int:
        """Read-only derived view over the strictly validated persisted policy."""

        from src.modules.jobs.retry import JobRetryPolicy

        return JobRetryPolicy.model_validate(self.retry_policy).max_attempts


class JobAttemptRecord(BaseModel):
    """One leased execution attempt for a durable background job."""

    job = fields.ForeignKeyField(
        "models.BackgroundJobRecord",
        related_name="attempts",
        on_delete=fields.CASCADE,
    )
    dispatch = fields.ForeignKeyField(
        "models.JobDispatchOutboxRecord",
        related_name="attempts",
        on_delete=fields.RESTRICT,
    )
    attempt_number = fields.IntField()
    fencing_token = fields.UUIDField(unique=True)
    status = fields.CharEnumField(JobAttemptStatus, max_length=24, db_index=True)
    worker_id = fields.CharField(max_length=160)
    handler_version = fields.IntField()
    claimed_at = fields.DatetimeField()
    lease_until = fields.DatetimeField(db_index=True)
    heartbeat_at = fields.DatetimeField()
    timeout_at = fields.DatetimeField(null=True)
    started_at = fields.DatetimeField()
    completed_at = fields.DatetimeField(null=True)
    error_code = fields.CharField(max_length=96, null=True)
    error_message = fields.TextField(null=True)
    error_metadata = fields.JSONField(null=True)
    failure_classification = fields.CharEnumField(
        JobFailureClassification,
        max_length=16,
        null=True,
    )
    retry_decision = fields.CharEnumField(
        JobRetryDecision,
        max_length=24,
        null=True,
    )
    retry_at = fields.DatetimeField(null=True)
    retry_schedule_source = fields.CharEnumField(
        JobRetryScheduleSource,
        max_length=32,
        null=True,
    )
    retry_delay_seconds = fields.FloatField(null=True)
    retry_hint_rejection_reason = fields.CharEnumField(
        JobRetryHintRejectionReason,
        max_length=24,
        null=True,
    )
    provider_references = fields.JSONField(null=True)
    result_reference = fields.JSONField(null=True)

    if TYPE_CHECKING:
        job_id: UUID
        dispatch_id: UUID

    class Meta(BaseModel.Meta):
        table = "background_job_attempts"
        table_description = "Leased execution attempts for durable background jobs."
        abstract = False
        unique_together = (("job_id", "attempt_number"),)
        indexes = (("status", "lease_until"),)


class JobDispatchOutboxRecord(BaseModel):
    """Transactional dispatch intent for one background-job delivery."""

    job = fields.ForeignKeyField(
        "models.BackgroundJobRecord",
        related_name="dispatches",
        on_delete=fields.CASCADE,
    )
    dispatch_sequence = fields.IntField()
    task_name = fields.CharField(max_length=192)
    message_schema_version = fields.IntField(default=1)
    envelope = fields.JSONField()
    envelope_hash = fields.CharField(max_length=64)
    status = fields.CharEnumField(
        JobDispatchStatus,
        max_length=16,
        default=JobDispatchStatus.PENDING,
        db_index=True,
    )
    workload_class = fields.CharEnumField(JobWorkloadClass, max_length=32, db_index=True)
    available_at = fields.DatetimeField(db_index=True)
    next_dispatch_at = fields.DatetimeField(null=True, db_index=True)
    dispatch_attempt_count = fields.IntField(default=0)
    dispatcher_id = fields.CharField(max_length=160, null=True)
    claim_token = fields.UUIDField(null=True, unique=True)
    lease_until = fields.DatetimeField(null=True, db_index=True)
    heartbeat_at = fields.DatetimeField(null=True)
    dispatched_at = fields.DatetimeField(null=True)
    task_message_id = fields.CharField(max_length=192, null=True)
    last_error = fields.TextField(null=True)

    if TYPE_CHECKING:
        job_id: UUID

    class Meta(BaseModel.Meta):
        table = "background_job_dispatch_outbox"
        table_description = "Transactional Taskiq dispatch intents for durable jobs."
        abstract = False
        unique_together = (("job_id", "dispatch_sequence"),)
        indexes = (("status", "available_at", "next_dispatch_at"), ("status", "lease_until"))
