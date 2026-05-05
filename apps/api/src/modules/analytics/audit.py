from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic import ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.analytics.audit_event import AuditEvent
from src.modules.analytics.ingest.service import sanitize_properties


class ActivityAuditPayload(BaseSchema):
    """Typed payload for required Activity audit evidence."""

    model_config = ConfigDict(frozen=True)

    event_name: str = Field(..., min_length=1, max_length=128)
    actor_user_id: UUID | None = None
    organization_id: UUID | None = None
    workspace_id: UUID | None = None
    subject_user_id: UUID | None = None
    entity_type: str | None = Field(default=None, max_length=64)
    entity_id: UUID | None = None
    source: str = Field(default="api", max_length=32)
    trace_id: str | None = Field(default=None, max_length=64)
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    properties: JsonObject = Field(default_factory=dict)


async def write_required_activity_event(
    *,
    settings: Settings,
    payload: ActivityAuditPayload,
    conn: BaseDBAsyncClient | None = None,
) -> AuditEvent:
    """Persist required Activity evidence through a direct database write."""

    audit = settings.analytics.audit_log
    properties = sanitize_properties(
        payload.properties,
        max_keys=audit.max_property_keys,
        max_string_length=audit.max_string_length,
        max_depth=audit.max_depth,
    )
    row: dict[str, Any] = {
        "occurred_at": payload.occurred_at,
        "event_name": payload.event_name,
        "organization_id": payload.organization_id,
        "workspace_id": payload.workspace_id,
        "actor_user_id": payload.actor_user_id,
        "subject_user_id": payload.subject_user_id,
        "entity_type": payload.entity_type,
        "entity_id": payload.entity_id,
        "trace_id": payload.trace_id,
        "source": payload.source,
        "properties": properties if isinstance(properties, dict) else None,
    }
    if conn is None:
        return await AuditEvent.create(**row)
    return await AuditEvent.create(using_db=conn, **row)


def activity_properties_from_payload(payload: dict[str, Any]) -> JsonObject:
    return {
        str(key): value
        for key, value in payload.items()
        if key
        not in {
            "organization_id",
            "org_id",
            "workspace_id",
            "actor_user_id",
            "subject_user_id",
            "entity_type",
            "entity_id",
        }
        and isinstance(key, str)
    }
