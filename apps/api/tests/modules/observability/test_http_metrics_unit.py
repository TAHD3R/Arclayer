from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from starlette.requests import Request

from src.core.events import Event
from src.core.middleware.request_log import RequestLogMiddleware
from src.modules.observability.http_metrics import (
    HTTP_REQUEST_METRIC_EVENT,
    persist_http_request_metric_event,
    record_http_request_metric,
)


def _scope(path: str = "/api/v1/missing") -> dict:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("localhost", 8000),
        "state": {},
    }


@pytest.mark.asyncio
async def test_record_http_request_metric_uses_atomic_hourly_upsert() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    actor_user_id = uuid4()
    occurred_at = datetime(2026, 7, 12, 18, 42, 15, tzinfo=UTC)
    connection = MagicMock()
    connection.execute_query = AsyncMock()

    connection_registry = MagicMock()
    connection_registry.get.return_value = connection
    with patch("src.modules.observability.http_metrics.connections", connection_registry):
        await record_http_request_metric(
            trace_id="trace-1",
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            project_id=project_id,
            route_template="/api/v1/projects/{project_id}",
            method="GET",
            status_code=503,
            duration_ms=81,
            occurred_at=occurred_at,
        )

    connection.execute_query.assert_awaited_once()
    assert connection.execute_query.await_args is not None
    sql, values = connection.execute_query.await_args.args
    assert "observability_http_request_records" in sql
    assert "ON CONFLICT" in sql
    assert "GREATEST" in sql
    assert values[2:6] == ["trace-1", actor_user_id, workspace_id, project_id]
    assert values[11] == datetime(2026, 7, 12, 18, 0, tzinfo=UTC)
    assert values[13:] == [5, 1]


@pytest.mark.asyncio
async def test_http_metric_event_validates_and_persists_captured_context() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    event = Event(
        name=HTTP_REQUEST_METRIC_EVENT,
        trace_id="trace-1",
        actor_user_id=str(uuid4()),
        payload={
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "routeTemplate": "/api/v1/projects/{project_id}",
            "method": "POST",
            "statusCode": 201,
            "durationMs": 32,
        },
    )

    with patch(
        "src.modules.observability.http_metrics.record_http_request_metric",
        new_callable=AsyncMock,
    ) as persist:
        await persist_http_request_metric_event(event)

    persist.assert_awaited_once_with(
        trace_id="trace-1",
        actor_user_id=UUID(event.actor_user_id),
        workspace_id=workspace_id,
        project_id=project_id,
        route_template="/api/v1/projects/{project_id}",
        method="POST",
        status_code=201,
        duration_ms=32,
        occurred_at=event.occurred_at,
    )


@pytest.mark.asyncio
async def test_request_log_publishes_metric_without_waiting_for_database_write() -> None:
    async def app(scope, receive, send) -> None:  # pragma: no cover - constructor dependency only
        raise AssertionError("app should not be called")

    middleware = RequestLogMiddleware(app, api_path_prefix="/api")
    scope = _scope()
    request = Request(scope)

    with patch("src.core.middleware.request_log.events.publish", new_callable=AsyncMock) as publish:
        await middleware._record_observability(
            scope=scope,
            request=request,
            status=404,
            elapsed_ms=12,
        )

    publish.assert_awaited_once()
    assert publish.await_args is not None
    event = publish.await_args.args[0]
    assert event.name == HTTP_REQUEST_METRIC_EVENT
    assert event.payload["routeTemplate"] == "__unmatched__"
    assert event.payload["statusCode"] == 404


@pytest.mark.asyncio
async def test_request_log_does_not_publish_when_observability_is_disabled() -> None:
    async def app(scope, receive, send) -> None:  # pragma: no cover - constructor dependency only
        raise AssertionError("app should not be called")

    middleware = RequestLogMiddleware(app, observability_enabled=False)
    scope = _scope()

    with patch("src.core.middleware.request_log.events.publish", new_callable=AsyncMock) as publish:
        await middleware._record_observability(
            scope=scope,
            request=Request(scope),
            status=200,
            elapsed_ms=5,
        )

    publish.assert_not_awaited()
