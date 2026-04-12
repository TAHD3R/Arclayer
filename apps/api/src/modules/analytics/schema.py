from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import AliasChoices, Field

from src.common.schemas import BaseOut, BaseSchema, TimestampMixin
from src.common.types.public_uuid import PublicUUID


class ActivityUserSummaryOut(BaseSchema):
    """
    Lightweight user summary for Activity rendering.

    Notes:
    - Keep it stable and minimal for UI.
    - Do not include sensitive fields.
    """

    id: PublicUUID = Field(..., description="User id.")
    username: str | None = Field(default=None, description="Username.")
    display_name: str | None = Field(default=None, description="Display name.")
    avatar_url: str | None = Field(default=None, description="Avatar URL.")


class AuditEventOut(BaseOut, TimestampMixin):
    occurred_at: datetime = Field(..., description="Event time (UTC).")
    event_name: str = Field(..., description="Event name.")

    organization_id: PublicUUID | None = Field(default=None, description="Organization id.")
    workspace_id: PublicUUID | None = Field(default=None, description="Workspace id.")

    actor_user_id: PublicUUID | None = Field(default=None, description="Actor user id.")
    subject_user_id: PublicUUID | None = Field(default=None, description="Subject user id.")

    actor: ActivityUserSummaryOut | None = Field(default=None, description="Actor user summary (best-effort).")
    subject: ActivityUserSummaryOut | None = Field(default=None, description="Subject user summary (best-effort).")

    entity_type: str | None = Field(default=None, description="Entity type.")
    entity_id: PublicUUID | None = Field(default=None, description="Entity id.")

    trace_id: str | None = Field(default=None, description="Request trace id (best-effort).")
    source: str | None = Field(default=None, description="Event source.")

    properties: dict[str, Any] | None = Field(default=None, description="Sanitized event properties.")


class AuditEventListQuery(BaseSchema):
    occurred_from: datetime | None = Field(
        default=None,
        description="Filter: occurred_at >= this timestamp (UTC).",
        validation_alias=AliasChoices("occurredFrom", "from"),
    )
    occurred_to: datetime | None = Field(
        default=None,
        description="Filter: occurred_at <= this timestamp (UTC).",
        validation_alias=AliasChoices("occurredTo", "to"),
    )
    event_name: str | None = Field(default=None, description="Filter: event name (contains).")
    workspace_id: PublicUUID | None = Field(default=None, description="Filter: workspace id.")
    actor_user_id: PublicUUID | None = Field(default=None, description="Filter: actor user id.")
    subject_user_id: PublicUUID | None = Field(default=None, description="Filter: subject user id.")
    entity_type: str | None = Field(default=None, description="Filter: entity type.")
    entity_id: PublicUUID | None = Field(default=None, description="Filter: entity id.")
