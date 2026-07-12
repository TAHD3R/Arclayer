from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class FeedbackSource(StrEnum):
    HEADER = "header"
    AI_SIDEBAR = "ai_sidebar"
    FEEDBACK_CENTER = "feedback_center"


class FeedbackContextType(StrEnum):
    GLOBAL = "global"
    WORKSPACE = "workspace"
    PROJECT = "project"
    AI_CONVERSATION = "ai_conversation"


class FeedbackCategory(StrEnum):
    BUG = "bug"
    FEATURE_REQUEST = "feature_request"
    USABILITY = "usability"
    PERFORMANCE = "performance"
    BILLING = "billing"
    OTHER = "other"


class FeedbackStatus(StrEnum):
    NEW = "new"
    TRIAGED = "triaged"
    IN_PROGRESS = "in_progress"
    WAITING_FOR_CUSTOMER = "waiting_for_customer"
    RESOLVED = "resolved"
    CLOSED = "closed"


class FeedbackPriority(StrEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class FeedbackMessageKind(StrEnum):
    REPLY = "reply"
    INTERNAL_NOTE = "internal_note"


class FeedbackTicket(BaseModel):
    """User-submitted product feedback ticket."""

    reporter_user_id = fields.UUIDField(db_index=True)
    client_request_id = fields.CharField(max_length=128)
    submission_fingerprint = fields.CharField(max_length=64)
    reporter_email = fields.CharField(max_length=255, null=True)
    reporter_username = fields.CharField(max_length=64)
    reporter_display_name = fields.CharField(max_length=64, null=True)
    reporter_avatar_url = fields.CharField(max_length=512, null=True)
    workspace_id = fields.UUIDField(null=True, db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    source = fields.CharEnumField(FeedbackSource, db_index=True)
    context_type = fields.CharEnumField(FeedbackContextType, db_index=True)
    category = fields.CharEnumField(FeedbackCategory, default=FeedbackCategory.OTHER, db_index=True)
    message = fields.TextField()
    rating = fields.SmallIntField(null=True)
    status = fields.CharEnumField(FeedbackStatus, default=FeedbackStatus.NEW, db_index=True)
    priority = fields.CharEnumField(FeedbackPriority, default=FeedbackPriority.NORMAL, db_index=True)
    assigned_to_user_id = fields.UUIDField(null=True, db_index=True)
    context_url = fields.CharField(max_length=2048, null=True)
    context = fields.JSONField(default=dict)
    last_activity_at = fields.DatetimeField(db_index=True)
    first_response_at = fields.DatetimeField(null=True)
    resolved_at = fields.DatetimeField(null=True)
    closed_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "product_feedback_tickets"
        table_description = "Product feedback support tickets."
        abstract = False
        unique_together = (("reporter_user_id", "client_request_id"),)
        indexes = (("status", "last_activity_at"), ("workspace_id", "last_activity_at"))


class FeedbackMessage(BaseModel):
    """Staff reply or private internal note attached to a feedback ticket."""

    ticket = fields.ForeignKeyField(
        "models.FeedbackTicket",
        related_name="messages",
        on_delete=fields.CASCADE,
    )
    author_user_id = fields.UUIDField(db_index=True)
    author_email = fields.CharField(max_length=255, null=True)
    author_username = fields.CharField(max_length=64)
    author_display_name = fields.CharField(max_length=64, null=True)
    author_avatar_url = fields.CharField(max_length=512, null=True)
    kind = fields.CharEnumField(FeedbackMessageKind, db_index=True)
    body = fields.TextField()

    class Meta(BaseModel.Meta):
        table = "product_feedback_messages"
        table_description = "Replies and internal notes for product feedback tickets."
        abstract = False
        indexes = (("ticket_id", "created_at"),)
