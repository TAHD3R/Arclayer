from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class AgentRunRecoveryAction(StrEnum):
    RETRY = "retry"
    RECONCILE = "reconcile"


class AgentRunRecoveryStatus(StrEnum):
    ACCEPTED = "accepted"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentRunExecutionEffectDisposition(StrEnum):
    ACTIVE = "active"
    COMMITTED = "committed"
    UNKNOWN = "unknown"


class AgentRunRecoveryRecord(BaseModel):
    """One idempotent Platform recovery command and its durable receipt."""

    run = fields.ForeignKeyField(
        "models.AgentRunV1Record",
        related_name="platform_recoveries",
        on_delete=fields.RESTRICT,
    )
    source_job = fields.ForeignKeyField(
        "models.BackgroundJobRecord",
        related_name="agent_run_recovery_sources",
        on_delete=fields.RESTRICT,
    )
    recovery_job = fields.OneToOneField(
        "models.BackgroundJobRecord",
        related_name="agent_run_recovery",
        on_delete=fields.RESTRICT,
        null=True,
    )
    action = fields.CharEnumField(AgentRunRecoveryAction, max_length=16, db_index=True)
    status = fields.CharEnumField(
        AgentRunRecoveryStatus,
        max_length=16,
        default=AgentRunRecoveryStatus.ACCEPTED,
        db_index=True,
    )
    generation = fields.IntField()
    source_run_sequence = fields.IntField()
    source_job_status = fields.CharField(max_length=32)
    actor_user_id = fields.UUIDField(db_index=True)
    idempotency_key_hash = fields.CharField(max_length=64, unique=True)
    request_fingerprint = fields.CharField(max_length=64)
    correlation_id = fields.UUIDField(db_index=True)
    reason = fields.CharField(max_length=512, null=True)
    accepted_at = fields.DatetimeField(db_index=True)
    completed_at = fields.DatetimeField(null=True, db_index=True)
    evidence = fields.JSONField(null=True)

    if TYPE_CHECKING:
        run_id: UUID
        source_job_id: UUID
        recovery_job_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "agent_run_recoveries"
        unique_together = (("run_id", "generation"),)
        indexes = (("run_id", "status", "accepted_at"),)
        abstract = False


class AgentRunExecutionEffectRecord(BaseModel):
    """Attempt-fenced Agent outcome boundary and immutable returned receipt."""

    run = fields.ForeignKeyField(
        "models.AgentRunV1Record",
        related_name="execution_effects",
        on_delete=fields.RESTRICT,
    )
    job = fields.ForeignKeyField(
        "models.BackgroundJobRecord",
        related_name="agent_run_execution_effects",
        on_delete=fields.RESTRICT,
    )
    owner_attempt = fields.ForeignKeyField(
        "models.JobAttemptRecord",
        related_name="agent_run_execution_effects",
        on_delete=fields.RESTRICT,
    )
    effect_key = fields.CharField(max_length=128)
    request_hash = fields.CharField(max_length=64)
    disposition = fields.CharEnumField(
        AgentRunExecutionEffectDisposition,
        max_length=16,
        default=AgentRunExecutionEffectDisposition.ACTIVE,
        db_index=True,
    )
    outcome = fields.JSONField(null=True)
    outcome_hash = fields.CharField(max_length=64, null=True)
    error_code = fields.CharField(max_length=192, null=True)
    registered_at = fields.DatetimeField(db_index=True)
    settled_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        run_id: UUID
        job_id: UUID
        owner_attempt_id: UUID

    class Meta(BaseModel.Meta):
        table = "agent_run_execution_effects"
        unique_together = (("job_id", "owner_attempt_id", "effect_key"),)
        indexes = (
            ("run_id", "disposition", "registered_at"),
            ("job_id", "disposition", "registered_at"),
        )
        abstract = False
