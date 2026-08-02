from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class CommercialLifecycleNotificationChannel(StrEnum):
    IN_APP = "in_app"
    EMAIL = "email"


class CommercialLifecycleNotificationState(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    SENT = "sent"
    SUPPRESSED = "suppressed"
    FAILED = "failed"


class CommercialLifecycleNotificationDelivery(BaseModel):
    """Per-recipient, per-channel ledger for committed Commerce lifecycle facts."""

    workspace_id = fields.UUIDField(db_index=True)
    source_identity = fields.CharField(max_length=255)
    recipient_user_id = fields.UUIDField(db_index=True)
    channel = fields.CharEnumField(CommercialLifecycleNotificationChannel)
    state = fields.CharEnumField(
        CommercialLifecycleNotificationState, default=CommercialLifecycleNotificationState.PENDING
    )
    milestone = fields.CharField(max_length=96)
    notification_id = fields.UUIDField(null=True, unique=True)
    attempt_count = fields.IntField(default=0)
    processing_at = fields.DatetimeField(null=True)
    claim_job_attempt_id = fields.UUIDField(null=True)
    claim_fencing_token = fields.UUIDField(null=True)
    claim_lease_until = fields.DatetimeField(null=True, db_index=True)
    failure_code = fields.CharField(max_length=128, null=True)
    failure_message = fields.CharField(max_length=512, null=True)
    is_retryable = fields.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        table = "system_commercial_lifecycle_notification_deliveries"
        table_description = "Transactional Commerce lifecycle delivery evidence outside Campaign authority."
        abstract = False
        unique_together = (("source_identity", "recipient_user_id", "channel"),)
        indexes = (("workspace_id", "state", "created_at"),)


class CommercialLifecycleNotificationDeliveryAttempt(BaseModel):
    """Append-only result for one attempt against the stable delivery ledger row."""

    delivery = fields.ForeignKeyField(
        "models.CommercialLifecycleNotificationDelivery",
        related_name="attempts",
        on_delete=fields.CASCADE,
    )
    attempt_number = fields.IntField()
    state = fields.CharEnumField(CommercialLifecycleNotificationState)
    completed_at = fields.DatetimeField(null=True)
    failure_code = fields.CharField(max_length=128, null=True)
    failure_message = fields.CharField(max_length=512, null=True)

    class Meta(BaseModel.Meta):
        table = "system_commercial_lifecycle_notification_delivery_attempts"
        table_description = "Append-only attempt evidence for commercial lifecycle notification delivery."
        abstract = False
        unique_together = (("delivery_id", "attempt_number"),)


class CommercialLifecycleNotificationCriticalFailure(BaseModel):
    """Durable notification-domain source condition awaiting Operational Signal projection."""

    workspace_id = fields.UUIDField(db_index=True)
    source_identity = fields.CharField(max_length=255, unique=True)
    milestone = fields.CharField(max_length=96)
    failure_code = fields.CharField(max_length=128)
    billing_contact_count = fields.IntField()

    class Meta(BaseModel.Meta):
        table = "system_commercial_lifecycle_notification_critical_failures"
        table_description = "Critical commercial delivery conditions without authority over source lifecycle."
        abstract = False
