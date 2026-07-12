from __future__ import annotations

from datetime import datetime

from pydantic import AliasChoices, Field, PrivateAttr

from src.common.schemas import BaseOut, BaseSchema, TimestampMixin
from src.common.types.json_types import JsonObject
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
    _organization_id: PublicUUID | None = PrivateAttr(default=None)

    occurred_at: datetime = Field(..., description="Event time (UTC).")
    event_name: str = Field(..., description="Event name.")

    workspace_id: PublicUUID | None = Field(default=None, description="Workspace id.")
    project_id: PublicUUID | None = Field(default=None, description="Project id.")

    actor_user_id: PublicUUID | None = Field(default=None, description="Actor user id.")
    subject_user_id: PublicUUID | None = Field(default=None, description="Subject user id.")

    actor: ActivityUserSummaryOut | None = Field(default=None, description="Actor user summary (best-effort).")
    subject: ActivityUserSummaryOut | None = Field(default=None, description="Subject user summary (best-effort).")

    entity_type: str | None = Field(default=None, description="Entity type.")
    entity_id: PublicUUID | None = Field(default=None, description="Entity id.")

    trace_id: str | None = Field(default=None, description="Request trace id (best-effort).")
    source: str | None = Field(default=None, description="Event source.")

    properties: JsonObject | None = Field(default=None, description="Sanitized event properties.")


class AuditEventListQuery(BaseSchema):
    occurred_from: datetime | None = Field(
        default=None,
        alias="occurredFrom",
        description="Filter: occurred_at >= this timestamp (UTC).",
        validation_alias=AliasChoices("occurredFrom", "occurred_from", "from"),
    )
    occurred_to: datetime | None = Field(
        default=None,
        alias="occurredTo",
        description="Filter: occurred_at <= this timestamp (UTC).",
        validation_alias=AliasChoices("occurredTo", "occurred_to", "to"),
    )
    event_name: str | None = Field(
        default=None,
        alias="eventName",
        description="Filter: event name (contains).",
        validation_alias=AliasChoices("eventName", "event_name"),
    )
    workspace_id: PublicUUID | None = Field(
        default=None,
        alias="workspaceId",
        description="Filter: workspace id.",
        validation_alias=AliasChoices("workspaceId", "workspace_id"),
    )
    project_id: PublicUUID | None = Field(
        default=None,
        alias="projectId",
        description="Filter: project id.",
        validation_alias=AliasChoices("projectId", "project_id"),
    )
    actor_user_id: PublicUUID | None = Field(
        default=None,
        alias="actorUserId",
        description="Filter: actor user id.",
        validation_alias=AliasChoices("actorUserId", "actor_user_id"),
    )
    subject_user_id: PublicUUID | None = Field(
        default=None,
        alias="subjectUserId",
        description="Filter: subject user id.",
        validation_alias=AliasChoices("subjectUserId", "subject_user_id"),
    )
    entity_type: str | None = Field(
        default=None,
        alias="entityType",
        description="Filter: entity type.",
        validation_alias=AliasChoices("entityType", "entity_type"),
    )
    entity_id: PublicUUID | None = Field(
        default=None,
        alias="entityId",
        description="Filter: entity id.",
        validation_alias=AliasChoices("entityId", "entity_id"),
    )
