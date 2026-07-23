from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.system.notification import NotificationCategory


class NotificationOut(BaseOut):
    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    recipient_user_id: PublicUUID = Field(..., description="Recipient user id.")
    actor_user_id: PublicUUID | None = Field(default=None, description="Actor user id (best-effort).")

    category: NotificationCategory = Field(..., description="Notification category.")
    title: str = Field(..., description="Short title.")
    body: str | None = Field(default=None, description="Notification body; presentation controls its UI treatment.")

    target_to: str = Field(..., description="Frontend route path (e.g. /team/members).")
    target_meta: JsonObject | None = Field(default=None, description="Frontend routing metadata (non-sensitive).")

    event_name: str | None = Field(default=None, description="Optional event name.")
    dedupe_key: str | None = Field(default=None, description="Optional dedupe key.")

    read_at: datetime | None = Field(default=None, description="Read datetime (UTC) if read.")
    archived_at: datetime | None = Field(default=None, description="Archived datetime (UTC) if archived.")
    created_at: datetime = Field(..., description="Created datetime (UTC).")
    updated_at: datetime = Field(..., description="Updated datetime (UTC).")


class NotificationPreviewOut(BaseSchema):
    unread_count: int = Field(
        ..., ge=0, description="Total unread notifications for current user in current workspace."
    )
    items: list[NotificationOut] = Field(default_factory=list, description="Latest unread notifications.")


class NotificationListStatus(StrEnum):
    UNREAD = "unread"
    ALL = "all"
    ARCHIVED = "archived"


class NotificationListQuery(BaseSchema):
    status: NotificationListStatus = Field(
        default=NotificationListStatus.UNREAD,
        description="List status filter (unread/all).",
    )
    category: NotificationCategory | None = Field(default=None, description="Filter by category.")


class NotificationReadResult(BaseSchema):
    id: PublicUUID = Field(..., description="Notification id.")
    read_at: datetime | None = Field(default=None, description="Read datetime (UTC).")


class NotificationReadAllResult(BaseSchema):
    total_count: int = Field(..., ge=0, description="Total unread notifications before operation.")
    success_count: int = Field(..., ge=0, description="Updated count (marked as read).")


class NotificationDevSeedRequest(BaseSchema):
    count: int = Field(
        default=8,
        ge=1,
        le=50,
        description="How many demo notifications to create (dev/test only).",
    )


class NotificationDevSeedResult(BaseSchema):
    created_count: int = Field(..., ge=0, description="Created notifications count.")


class NotificationDeleteResult(BaseSchema):
    id: PublicUUID = Field(..., description="Notification id.")


class NotificationArchiveResult(BaseSchema):
    id: PublicUUID = Field(..., description="Notification id.")
    archived_at: datetime | None = Field(default=None, description="Archived datetime (UTC).")


class NotificationInteractionKind(StrEnum):
    READ = "read"
    CLICK = "click"
    DISMISS = "dismiss"


class NotificationInteractionOut(BaseSchema):
    notification_id: PublicUUID
    delivery_id: PublicUUID
    kind: NotificationInteractionKind
    occurred_at: datetime


class NotificationPreferenceChannelOut(BaseSchema):
    enabled: bool = Field(..., description="Whether this channel is currently enabled.")
    supported: bool = Field(..., description="Whether backend currently supports this channel.")
    mutable: bool = Field(..., description="Whether current user can change this channel.")


class NotificationPreferenceTopicOut(BaseSchema):
    key: str = Field(..., description="Stable topic key.")
    category: NotificationCategory = Field(..., description="Notification category for this topic.")
    title_i18n: str = Field(..., description="i18n key for topic title.")
    description_i18n: str = Field(..., description="i18n key for topic description.")
    channels: dict[Literal["in_app", "email"], NotificationPreferenceChannelOut] = Field(
        ...,
        description="Per-channel state for this topic.",
    )


class NotificationPreferencesOut(BaseSchema):
    topics: list[NotificationPreferenceTopicOut] = Field(
        default_factory=list,
        description="All supported notification preference topics.",
    )


class NotificationPreferencePatchIn(BaseSchema):
    topic_key: str = Field(..., description="Topic key to update.")
    channel: Literal["in_app", "email"] = Field(..., description="Channel to update.")
    enabled: bool = Field(..., description="Target enabled value.")
