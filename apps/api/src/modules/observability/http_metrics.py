from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise import connections

from src.common.utils.ids import uuid7
from src.core.events import Event
from src.core.logging import get_logger

logger = get_logger(__name__)
HTTP_REQUEST_METRIC_EVENT = "observability.http_request.completed"
OBSERVABILITY_QUERY_ROUTE_TAGS = frozenset({
    "domain.observability",
    "internal.system.observability",
})


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


async def record_http_request_metric(
    *,
    trace_id: str | None,
    actor_user_id: UUID | None,
    workspace_id: UUID | None,
    project_id: UUID | None,
    route_template: str,
    method: str,
    status_code: int,
    duration_ms: int,
    occurred_at: datetime | None = None,
) -> None:
    """Persist one request fact and atomically add it to the hourly metrics bucket."""

    now = occurred_at or datetime.now(UTC)
    bucket_start = now.replace(minute=0, second=0, microsecond=0)
    status_class = status_code // 100 if status_code > 0 else 0
    error_count = 1 if status_code >= 500 or status_code == 0 else 0
    conn = connections.get("default")
    duration_ms = max(duration_ms, 0)
    await conn.execute_query(
        """
        WITH request_record AS (
            INSERT INTO observability_http_request_records (
                id, created_at, updated_at, occurred_at, trace_id, actor_user_id,
                workspace_id, project_id, route_template, method, status_code, duration_ms
            )
            VALUES ($1, $2, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING occurred_at, workspace_id, project_id, route_template, method,
                status_code, duration_ms
        )
        INSERT INTO observability_http_request_metrics_hourly (
            id, created_at, updated_at, bucket_start, workspace_id, project_id,
            scope_key, route_template, method, status_class, request_count,
            error_count, duration_total_ms, duration_max_ms
        )
        SELECT $11, $2, $2, $12, workspace_id, project_id, $13, route_template,
            method, $14, 1, $15, duration_ms, duration_ms
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
            trace_id[:128] if trace_id else None,
            actor_user_id,
            workspace_id,
            project_id,
            route_template[:512],
            method[:8],
            status_code,
            duration_ms,
            uuid7(),
            bucket_start,
            _scope_key(workspace_id=workspace_id, project_id=project_id),
            status_class,
            error_count,
        ],
    )


def _optional_uuid(value: object, *, field: str) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except ValueError as exc:
        raise ValueError(f"{field} must be a UUID") from exc


def _required_string(value: object, *, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field} must be a non-empty string")
    return value


def _required_integer(value: object, *, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{field} must be an integer")
    return value


async def persist_http_request_metric_event(event: Event) -> None:
    """Persist one event-bus metric outside the originating request task."""

    payload = event.payload
    try:
        await record_http_request_metric(
            trace_id=event.trace_id,
            actor_user_id=_optional_uuid(event.actor_user_id, field="actorUserId"),
            workspace_id=_optional_uuid(payload.get("workspaceId"), field="workspaceId"),
            project_id=_optional_uuid(payload.get("projectId"), field="projectId"),
            route_template=_required_string(payload.get("routeTemplate"), field="routeTemplate"),
            method=_required_string(payload.get("method"), field="method"),
            status_code=_required_integer(payload.get("statusCode"), field="statusCode"),
            duration_ms=_required_integer(payload.get("durationMs"), field="durationMs"),
            occurred_at=event.occurred_at,
        )
    except Exception:
        logger.exception(
            "Failed to persist HTTP request metric",
            trace_id=event.trace_id,
            route_template=payload.get("routeTemplate"),
            method=payload.get("method"),
            status=payload.get("statusCode"),
        )
        raise
