from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class NotificationCampaignState(StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    DISPATCHING = "dispatching"
    COMPLETED = "completed"
    PARTIALLY_FAILED = "partially_failed"
    CANCELLED = "cancelled"
    ARCHIVED = "archived"


class NotificationCampaignConflictPolicy(StrEnum):
    QUEUE = "queue"
    REPLACE_LOWER_PRIORITY = "replace_lower_priority"


class NotificationCampaignChannel(StrEnum):
    IN_APP = "in_app"
    EMAIL = "email"


class NotificationPresentation(StrEnum):
    INBOX = "inbox"
    TOAST = "toast"
    MODAL = "modal"
    BANNER = "banner"
    EMAIL = "email"


class NotificationDeliveryState(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    SUPPRESSED = "suppressed"
    CANCELLED = "cancelled"


class NotificationDeliverySourceKind(StrEnum):
    CAMPAIGN = "campaign"
    TRANSACTIONAL = "transactional"
    FEEDBACK_REPLY = "feedback_reply"


class NotificationCampaignRecord(BaseModel):
    """One operator-authored, revision-controlled notification campaign."""

    name = fields.CharField(max_length=160, db_index=True)
    internal_description = fields.TextField(null=True)
    owner_user_id = fields.UUIDField(db_index=True)
    revision = fields.IntField(default=1)
    state = fields.CharEnumField(
        NotificationCampaignState,
        default=NotificationCampaignState.DRAFT,
        max_length=32,
        db_index=True,
    )
    audience = fields.JSONField(default=dict)
    audience_estimate = fields.IntField(null=True)
    audience_snapshot_at = fields.DatetimeField(null=True)
    schedule_at = fields.DatetimeField(null=True, db_index=True)
    timezone = fields.CharField(max_length=64, default="UTC")
    display_start_at = fields.DatetimeField(null=True)
    display_end_at = fields.DatetimeField(null=True)
    priority = fields.SmallIntField(default=0, db_index=True)
    conflict_policy = fields.CharEnumField(
        NotificationCampaignConflictPolicy,
        default=NotificationCampaignConflictPolicy.QUEUE,
        max_length=32,
    )
    channels = fields.JSONField(default=list)
    presentations = fields.JSONField(default=list)
    fallback_locale = fields.CharField(max_length=16, null=True)
    operation_job_id = fields.UUIDField(null=True, db_index=True)
    recipient_count = fields.IntField(default=0)
    pending_count = fields.IntField(default=0)
    sent_count = fields.IntField(default=0)
    delivered_count = fields.IntField(default=0)
    failed_count = fields.IntField(default=0)
    suppressed_count = fields.IntField(default=0)
    read_count = fields.IntField(default=0)
    clicked_count = fields.IntField(default=0)
    dismissed_count = fields.IntField(default=0)
    published_at = fields.DatetimeField(null=True)
    dispatch_started_at = fields.DatetimeField(null=True)
    completed_at = fields.DatetimeField(null=True)
    cancelled_at = fields.DatetimeField(null=True)
    archived_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "notification_campaigns"
        table_description = "Revision-controlled global notification campaigns."
        abstract = False
        indexes = (("state", "schedule_at"), ("state", "updated_at"))


class NotificationCampaignVariantRecord(BaseModel):
    """Localized, channel-specific content owned by one campaign revision."""

    campaign = fields.ForeignKeyField(
        "models.NotificationCampaignRecord",
        related_name="variants",
        on_delete=fields.CASCADE,
    )
    locale = fields.CharField(max_length=16, db_index=True)
    revision = fields.IntField(default=1)
    is_fallback = fields.BooleanField(default=False)
    inbox_payload = fields.JSONField(null=True)
    email_payload = fields.JSONField(null=True)
    modal_payload = fields.JSONField(null=True)
    banner_payload = fields.JSONField(null=True)
    toast_payload = fields.JSONField(null=True)

    if TYPE_CHECKING:
        campaign_id: UUID

    class Meta(BaseModel.Meta):
        table = "notification_campaign_variants"
        table_description = "Localized presentation payloads for notification campaigns."
        abstract = False
        unique_together = (("campaign_id", "locale"),)


class NotificationDeliveryRecord(BaseModel):
    """Durable per-recipient delivery and interaction ledger."""

    campaign = fields.ForeignKeyField(
        "models.NotificationCampaignRecord",
        related_name="deliveries",
        on_delete=fields.RESTRICT,
        null=True,
    )
    variant = fields.ForeignKeyField(
        "models.NotificationCampaignVariantRecord",
        related_name="deliveries",
        on_delete=fields.RESTRICT,
        null=True,
    )
    recipient_user_id = fields.UUIDField(db_index=True)
    source_kind = fields.CharEnumField(
        NotificationDeliverySourceKind,
        default=NotificationDeliverySourceKind.CAMPAIGN,
        max_length=32,
        db_index=True,
    )
    source_identity = fields.CharField(max_length=256, db_index=True)
    recipient_locale = fields.CharField(max_length=16)
    channel = fields.CharEnumField(NotificationCampaignChannel, max_length=16, db_index=True)
    presentation = fields.CharEnumField(NotificationPresentation, max_length=16, db_index=True)
    idempotency_key = fields.CharField(max_length=256, unique=True)
    state = fields.CharEnumField(
        NotificationDeliveryState,
        default=NotificationDeliveryState.PENDING,
        max_length=16,
        db_index=True,
    )
    attempt_count = fields.IntField(default=0)
    scheduled_at = fields.DatetimeField(null=True)
    processing_at = fields.DatetimeField(null=True)
    sent_at = fields.DatetimeField(null=True)
    delivered_at = fields.DatetimeField(null=True)
    read_at = fields.DatetimeField(null=True)
    clicked_at = fields.DatetimeField(null=True)
    dismissed_at = fields.DatetimeField(null=True)
    notification_id = fields.UUIDField(null=True, db_index=True)
    provider_message_id = fields.CharField(max_length=256, null=True, db_index=True)
    failure_code = fields.CharField(max_length=128, null=True)
    failure_message = fields.CharField(max_length=512, null=True)
    is_retryable = fields.BooleanField(default=False, db_index=True)
    last_operator_retry_key = fields.CharField(max_length=128, null=True)

    if TYPE_CHECKING:
        campaign_id: UUID
        variant_id: UUID

    class Meta(BaseModel.Meta):
        table = "notification_deliveries"
        table_description = "Per-recipient notification delivery and interaction ledger."
        abstract = False
        indexes = (
            ("campaign_id", "state"),
            ("recipient_user_id", "presentation", "state"),
            ("campaign_id", "recipient_user_id"),
            ("source_kind", "source_identity"),
        )
