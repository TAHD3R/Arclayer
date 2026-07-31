from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field
from tortoise import connections

from src.common.schemas import BaseSchema
from src.common.utils.ids import uuid7
from src.core.events import Event
from src.core.logging import get_logger

logger = get_logger(__name__)
HTTP_REQUEST_METRIC_EVENT = "observability.http_request.completed"
HTTP_REQUEST_RECORD_SCHEMA_VERSION = 2
OBSERVABILITY_QUERY_ROUTE_TAGS = frozenset({
    "domain.observability",
    "internal.system.observability",
})


class HTTPRequestRecordFact(BaseSchema):
    """Validated, bounded request fact accepted by the persistence boundary."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    request_id: str | None = Field(default=None, min_length=1, max_length=128)
    trace_id: str | None = Field(default=None, min_length=1, max_length=64)
    actor_user_id: UUID | None = None
    workspace_id: UUID | None = None
    project_id: UUID | None = None
    normalized_path: str = Field(min_length=1, max_length=512)
    route_template: str = Field(min_length=1, max_length=512)
    method: str = Field(min_length=1, max_length=8, pattern=r"^[A-Z]+$")
    protocol: str = Field(min_length=1, max_length=16)
    status_code: int = Field(ge=0, le=599)
    duration_ms: int = Field(ge=0)
    request_bytes: int | None = Field(default=None, ge=0)
    response_bytes: int | None = Field(default=None, ge=0)
    service_name: str = Field(min_length=1, max_length=128)
    upstream_name: str | None = Field(default=None, min_length=1, max_length=128)
    environment: str | None = Field(default=None, min_length=1, max_length=32)
    release_version: str | None = Field(default=None, min_length=1, max_length=128)
    instance_id: str | None = Field(default=None, min_length=1, max_length=128)
    region: str | None = Field(default=None, min_length=1, max_length=64)
    user_agent_family: str | None = Field(default=None, min_length=1, max_length=64)
    device_family: str | None = Field(default=None, min_length=1, max_length=64)
    client_network: str | None = Field(default=None, min_length=1, max_length=80)
    error_code: str | None = Field(default=None, min_length=1, max_length=128)
    error_class: str | None = Field(default=None, min_length=1, max_length=128)
    error_message: str | None = Field(default=None, min_length=1, max_length=512)
    ingestion_source: str = Field(min_length=1, max_length=64)
    schema_version: Literal[2] = HTTP_REQUEST_RECORD_SCHEMA_VERSION


def is_observability_query_route(route: object | None) -> bool:
    """Return whether a route reads the same metrics that this sink persists.

    Dashboard polling is intentionally excluded from the product request totals:
    otherwise opening an observability page changes the next dashboard sample.
    Route tags are the stable API contract; raw URL matching is deliberately avoided.
    """

    tags = getattr(route, "tags", None) or ()
    return any(tag in OBSERVABILITY_QUERY_ROUTE_TAGS for tag in tags)


def _scope_key(*, workspace_id: UUID | None, project_id: UUID | None) -> str:
    if project_id is not None:
        return f"project:{project_id}"
    if workspace_id is not None:
        return f"workspace:{workspace_id}"
    return "system"


async def record_http_request_metric(fact: HTTPRequestRecordFact) -> None:
    """Persist one request fact and atomically add it to the hourly metrics bucket."""

    now = fact.occurred_at
    bucket_start = now.replace(minute=0, second=0, microsecond=0)
    status_class = fact.status_code // 100 if fact.status_code > 0 else 0
    error_count = 1 if fact.status_code >= 500 or fact.status_code == 0 else 0
    conn = connections.get("default")
    await conn.execute_query(
        """
        WITH input AS (
            SELECT *
            FROM jsonb_to_record($3::jsonb) AS i(
                request_id text, trace_id text, actor_user_id uuid, workspace_id uuid,
                project_id uuid, normalized_path text, route_template text, method text,
                protocol text, status_code smallint, duration_ms integer,
                request_bytes bigint, response_bytes bigint, service_name text,
                upstream_name text, environment text, release_version text,
                instance_id text, region text, user_agent_family text, device_family text,
                client_network text, error_code text, error_class text, error_message text,
                ingestion_source text, schema_version smallint
            )
        ), request_record AS (
            INSERT INTO observability_http_request_records (
                id, created_at, updated_at, occurred_at, request_id, trace_id,
                actor_user_id, actor_username, actor_display_name, actor_avatar_url,
                workspace_id, workspace_name, project_id, project_name, normalized_path,
                route_template, method, protocol, status_code, duration_ms,
                request_bytes, response_bytes, service_name, upstream_name, environment,
                release_version, instance_id, region, user_agent_family, device_family,
                client_network, error_code, error_class, error_message, ingestion_source,
                schema_version
            )
            SELECT
                $1, $2, $2, $2, i.request_id, i.trace_id,
                i.actor_user_id, u.username, u.display_name, u.avatar_url,
                i.workspace_id, w.name, i.project_id, p.name, i.normalized_path,
                i.route_template, i.method, i.protocol, i.status_code, i.duration_ms,
                i.request_bytes, i.response_bytes, i.service_name, i.upstream_name,
                i.environment, i.release_version, i.instance_id, i.region,
                i.user_agent_family, i.device_family, i.client_network, i.error_code,
                i.error_class, i.error_message, i.ingestion_source, i.schema_version
            FROM input i
            LEFT JOIN users u ON u.id = i.actor_user_id
            LEFT JOIN workspaces w ON w.id = i.workspace_id
            LEFT JOIN projects p ON p.id = i.project_id
            RETURNING occurred_at, workspace_id, project_id, route_template, method,
                status_code, duration_ms
        )
        INSERT INTO observability_http_request_metrics_hourly (
            id, created_at, updated_at, bucket_start, workspace_id, project_id,
            scope_key, route_template, method, status_class, request_count,
            error_count, duration_total_ms, duration_max_ms
        )
        SELECT $4, $2, $2, $5, workspace_id, project_id, $6, route_template,
            method, $7, 1, $8, duration_ms, duration_ms
        FROM request_record
        ON CONFLICT (bucket_start, scope_key, route_template, method, status_class)
        DO UPDATE SET
            updated_at = EXCLUDED.updated_at,
            request_count = observability_http_request_metrics_hourly.request_count + 1,
            error_count = observability_http_request_metrics_hourly.error_count + EXCLUDED.error_count,
            duration_total_ms = observability_http_request_metrics_hourly.duration_total_ms + EXCLUDED.duration_total_ms,
            duration_max_ms = GREATEST(
                observability_http_request_metrics_hourly.duration_max_ms,
                EXCLUDED.duration_max_ms
            )
        """,
        [
            uuid7(),
            now,
            json.dumps(fact.model_dump(mode="json", exclude={"occurred_at"})),
            uuid7(),
            bucket_start,
            _scope_key(workspace_id=fact.workspace_id, project_id=fact.project_id),
            status_class,
            error_count,
        ],
    )


async def persist_http_request_metric_event(event: Event) -> None:
    """Persist one event-bus metric outside the originating request task."""

    payload = event.payload
    try:
        fact = HTTPRequestRecordFact.model_validate({
            **payload,
            "occurredAt": event.occurred_at,
            "actorUserId": event.actor_user_id,
            "ingestionSource": event.source or payload.get("ingestionSource") or "event_bus",
        })
        await record_http_request_metric(fact)
    except Exception:
        logger.exception(
            "Failed to persist HTTP request metric",
            trace_id=event.trace_id,
            route_template=payload.get("routeTemplate"),
            method=payload.get("method"),
            status=payload.get("statusCode"),
        )
        raise
