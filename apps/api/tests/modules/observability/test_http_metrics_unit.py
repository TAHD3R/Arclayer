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
    HTTPRequestRecordFact,
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
            HTTPRequestRecordFact(
                occurred_at=occurred_at,
                request_id="request-1",
                trace_id="0123456789abcdef0123456789abcdef",
                actor_user_id=actor_user_id,
                workspace_id=workspace_id,
                project_id=project_id,
                normalized_path=f"/api/v1/projects/{project_id}",
                route_template="/api/v1/projects/{project_id}",
                method="GET",
                protocol="HTTP/1.1",
                status_code=503,
                duration_ms=81,
                request_bytes=120,
                response_bytes=84,
                service_name="Arclayer API",
                environment="test",
                error_code="UPSTREAM_UNAVAILABLE",
                error_class="APIError",
                error_message="Service unavailable",
                ingestion_source="request_log",
            )
        )

    connection.execute_query.assert_awaited_once()
    assert connection.execute_query.await_args is not None
    sql, values = connection.execute_query.await_args.args
    assert "observability_http_request_records" in sql
    assert "ON CONFLICT" in sql
    assert "GREATEST" in sql
    assert '"request_id": "request-1"' in values[2]
    assert f'"actor_user_id": "{actor_user_id}"' in values[2]
    assert f'"workspace_id": "{workspace_id}"' in values[2]
    assert f'"project_id": "{project_id}"' in values[2]
    assert values[4] == datetime(2026, 7, 12, 18, 0, tzinfo=UTC)
    assert values[6:] == [5, 1]


@pytest.mark.asyncio
async def test_http_metric_event_validates_and_persists_captured_context() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    event = Event(
        name=HTTP_REQUEST_METRIC_EVENT,
        trace_id="trace-1",
        actor_user_id=str(uuid4()),
        payload={
            "requestId": "request-1",
            "traceId": "0123456789abcdef0123456789abcdef",
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "normalizedPath": f"/api/v1/projects/{project_id}",
            "routeTemplate": "/api/v1/projects/{project_id}",
            "method": "POST",
            "protocol": "HTTP/1.1",
            "statusCode": 201,
            "durationMs": 32,
            "requestBytes": 12,
            "responseBytes": 24,
            "serviceName": "Arclayer API",
            "environment": "test",
            "ingestionSource": "request_log",
            "schemaVersion": 2,
        },
    )

    with patch(
        "src.modules.observability.http_metrics.record_http_request_metric",
        new_callable=AsyncMock,
    ) as persist:
        await persist_http_request_metric_event(event)

    persist.assert_awaited_once()
    assert persist.await_args is not None
    captured = persist.await_args.args[0]
    assert captured.actor_user_id == UUID(event.actor_user_id)
    assert captured.workspace_id == workspace_id
    assert captured.project_id == project_id
    assert captured.route_template == "/api/v1/projects/{project_id}"
    assert captured.method == "POST"
    assert captured.status_code == 201
    assert captured.duration_ms == 32
    assert captured.occurred_at == event.occurred_at


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
            request_bytes=0,
            response_bytes=0,
        )

    publish.assert_awaited_once()
    assert publish.await_args is not None
    event = publish.await_args.args[0]
    assert event.name == HTTP_REQUEST_METRIC_EVENT
    assert event.payload["routeTemplate"] == "__unmatched__"
    assert event.payload["statusCode"] == 404
    assert event.payload["normalizedPath"] == "/api/v1/missing"
    assert event.payload["protocol"] == "HTTP/1.1"
    assert event.payload["clientNetwork"] == "127.0.0.0/24"


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
            request_bytes=0,
            response_bytes=0,
        )

    publish.assert_not_awaited()
