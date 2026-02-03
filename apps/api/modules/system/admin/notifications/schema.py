from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import Field

from apps.api.common.schemas import BaseOut, BaseSchema
from apps.api.modules.system.models.notification import NotificationCategory


class NotificationOut(BaseOut):
    workspace_id: UUID = Field(..., description="Workspace id.")
    recipient_user_id: UUID = Field(..., description="Recipient user id.")
    actor_user_id: UUID | None = Field(default=None, description="Actor user id (best-effort).")

    category: NotificationCategory = Field(..., description="Notification category.")
    title: str = Field(..., description="Short title.")
    body: str | None = Field(default=None, description="Short body (max 2 lines in UI).")

    target_to: str = Field(..., description="Frontend route path (e.g. /team/members).")
    target_meta: dict[str, Any] | None = Field(default=None, description="Frontend routing metadata (non-sensitive).")

    event_name: str | None = Field(default=None, description="Optional event name.")
    dedupe_key: str | None = Field(default=None, description="Optional dedupe key.")

    read_at: datetime | None = Field(default=None, description="Read datetime (UTC) if read.")
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


class NotificationListQuery(BaseSchema):
    status: NotificationListStatus = Field(
        default=NotificationListStatus.UNREAD,
        description="List status filter (unread/all).",
    )
    category: NotificationCategory | None = Field(default=None, description="Filter by category.")


class NotificationReadResult(BaseSchema):
    id: UUID = Field(..., description="Notification id.")
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
    id: UUID = Field(..., description="Notification id.")
