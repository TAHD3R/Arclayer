from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class CommercialLifecycleNotificationChannel(StrEnum):
    IN_APP = "in_app"
    EMAIL = "email"


class CommercialLifecycleNotificationState(StrEnum):
    PENDING = "pending"
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
    failure_code = fields.CharField(max_length=128, null=True)
    failure_message = fields.CharField(max_length=512, null=True)

    class Meta(BaseModel.Meta):
        table = "system_commercial_lifecycle_notification_deliveries"
        table_description = "Transactional Commerce lifecycle delivery evidence outside Campaign authority."
        abstract = False
        unique_together = (("source_identity", "recipient_user_id", "channel"),)
        indexes = (("workspace_id", "state", "created_at"),)
