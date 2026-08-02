from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class HostingCommercialAccessState(StrEnum):
    SERVING = "serving"
    CONTINUITY_REQUIRED = "continuity_required"
    SUSPENDED = "suspended"
    RESTORATION_REQUIRED = "restoration_required"
    RESTORED = "restored"
    PARTIAL = "partial"


class HostingContinuityTargetGate(StrEnum):
    SERVING = "serving"
    CONTINUITY = "continuity"
    SUSPENDED = "suspended"


class HostingContinuityTargetRestorationState(StrEnum):
    NOT_REQUIRED = "not_required"
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class HostingDeliveryOperationTargetType(StrEnum):
    PUBLISH_JOB = "publish_job"
    HOSTING_CONTINUITY = "hosting_continuity"
    DOMAIN_BINDING = "domain_binding"
    STORAGE_PROFILE = "storage_profile"


class HostingDeliveryOperationAction(StrEnum):
    RETRY = "retry"
    RECONCILE = "reconcile"
    RESTORE = "restore"
    VERIFY_OWNERSHIP = "verify_ownership"
    TEST_READINESS = "test_readiness"


class HostingDeliveryOperationState(StrEnum):
    RUNNING = "running"
    SOURCE_CONFIRMED = "source_confirmed"
    PARTIAL = "partial"
    OUTCOME_UNKNOWN = "outcome_unknown"


class HostingDeliveryOperationVerificationState(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    NOT_CONFIRMED = "not_confirmed"


class HostingContinuityPolicy(BaseModel):
    """Immutable Hosting Policy revision selected when continuity begins."""

    revision = fields.BigIntField(unique=True)
    is_active = fields.BooleanField(default=False, db_index=True)
    continuity_window_seconds = fields.IntField()

    class Meta(BaseModel.Meta):
        table = "hosting_continuity_policies"
        table_description = "Versioned Hosting Continuity policy without an implicit default window."
        abstract = False


class HostingCommercialAccessProjection(BaseModel):
    """Hosting-owned continuity and restoration state; Commerce never writes release state."""

    workspace_id = fields.UUIDField(unique=True)
    state = fields.CharEnumField(HostingCommercialAccessState, default=HostingCommercialAccessState.SERVING)
    source_identity = fields.CharField(max_length=255, unique=True)
    continuity_source_identity = fields.CharField(max_length=255, null=True)
    continuity_started_at = fields.DatetimeField(null=True)
    continuity_deadline = fields.DatetimeField(null=True, db_index=True)
    policy_revision = fields.BigIntField(null=True)
    last_fact_effective_at = fields.DatetimeField(null=True)
    restoration_source_identity = fields.CharField(max_length=255, null=True)
    delivery_error_code = fields.CharField(max_length=128, null=True)
    delivery_error_message = fields.CharField(max_length=512, null=True)

    class Meta(BaseModel.Meta):
        table = "hosting_commercial_access_projections"
        table_description = "Hosting-owned response to Commerce commercial access facts."
        abstract = False
        indexes = (("state", "updated_at"),)


class HostingCommercialAccessReceipt(BaseModel):
    """At-least-once receipt for a committed Commerce fact or Hosting deadline transition."""

    source_identity = fields.CharField(max_length=255, unique=True)
    workspace_id = fields.UUIDField(db_index=True)
    resulting_state = fields.CharEnumField(HostingCommercialAccessState)

    class Meta(BaseModel.Meta):
        table = "hosting_commercial_access_receipts"
        table_description = "Idempotent Hosting consumption receipts for Commerce handoffs."
        abstract = False


class HostingContinuityTarget(BaseModel):
    """One preserved public-delivery target inside a Workspace Hosting transition."""

    projection = fields.ForeignKeyField(
        "models.HostingCommercialAccessProjection",
        related_name="targets",
        on_delete=fields.CASCADE,
    )
    site_id = fields.UUIDField()
    runtime_id = fields.UUIDField()
    preserved_release_id = fields.UUIDField(null=True)
    gate = fields.CharEnumField(HostingContinuityTargetGate, default=HostingContinuityTargetGate.SERVING)
    restoration_state = fields.CharEnumField(
        HostingContinuityTargetRestorationState,
        default=HostingContinuityTargetRestorationState.NOT_REQUIRED,
    )
    operation_identity = fields.CharField(max_length=255, null=True)
    failure_code = fields.CharField(max_length=128, null=True)
    failure_message = fields.CharField(max_length=512, null=True)
    verification_evidence = fields.TextField(null=True)
    verified_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        projection_id: UUID

    class Meta(BaseModel.Meta):
        table = "hosting_continuity_targets"
        table_description = "Per-site/runtime Hosting continuity gate and restoration outcomes."
        abstract = False
        unique_together = (("projection_id", "site_id", "runtime_id"),)
        indexes = (("projection_id", "gate", "updated_at"),)


class HostingDeliveryOperation(BaseModel):
    """Durable, source-bound evidence for one Hosting recovery command."""

    target_type = fields.CharEnumField(HostingDeliveryOperationTargetType, max_length=32)
    target_id = fields.UUIDField()
    action = fields.CharEnumField(HostingDeliveryOperationAction, max_length=32)
    actor_user_id = fields.UUIDField()
    idempotency_key = fields.CharField(max_length=128)
    source_revision = fields.DatetimeField()
    before_state = fields.CharField(max_length=64)
    resulting_state = fields.CharField(max_length=64, null=True)
    state = fields.CharEnumField(HostingDeliveryOperationState, max_length=32)
    verification_state = fields.CharEnumField(
        HostingDeliveryOperationVerificationState,
        max_length=32,
        default=HostingDeliveryOperationVerificationState.PENDING,
    )
    source_operation_identity = fields.CharField(max_length=255, null=True)
    result_reference_id = fields.UUIDField(null=True)
    failed_target_count = fields.IntField(default=0)
    evidence = fields.JSONField(default=dict)
    failure_code = fields.CharField(max_length=128, null=True)
    failure_message = fields.CharField(max_length=512, null=True)
    completed_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "hosting_delivery_operations"
        table_description = "Durable Hosting recovery commands, source results, and verification evidence."
        abstract = False
        unique_together = (("actor_user_id", "idempotency_key"),)
        indexes = (
            ("target_type", "target_id", "created_at"),
            ("state", "updated_at"),
        )


class HostingContinuityPolicyPreview(BaseModel):
    """Persisted, revision-bound review record for one future Hosting policy change."""

    expected_revision = fields.BigIntField()
    proposed_continuity_window_seconds = fields.IntField()
    snapshot_hash = fields.CharField(max_length=64)
    snapshot = fields.JSONField()
    applied_policy_revision = fields.BigIntField(null=True)
    applied_actor_user_id = fields.UUIDField(null=True)
    applied_idempotency_key = fields.CharField(max_length=128, null=True)
    applied_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "hosting_continuity_policy_previews"
        table_description = "Revision-bound Hosting Continuity policy previews and apply receipts."
        abstract = False
        unique_together = (("applied_actor_user_id", "applied_idempotency_key"),)
