from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi.routing import APIRoute
from starlette.requests import Request

from src.config import Settings
from src.core.middleware.request_log import RequestLogMiddleware
from src.core.registry import AppFactory
from src.modules.observability.system_router import router as system_observability_router


def _scope(*, route_tag: str) -> dict:
    path = "/platform-api/v1/observability/trends"
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
        "route": SimpleNamespace(path=path, tags=[route_tag]),
    }


def test_correlation_middleware_wraps_request_metrics_finalization() -> None:
    app = (
        AppFactory(
            Settings(
                app_env="test",
                database={"enabled": False},
                security={"enabled": False},
            )
        )
        .with_middlewares()
        .app
    )
    middleware_order = [entry.cls for entry in app.user_middleware]

    assert middleware_order.index(CorrelationIdMiddleware) < middleware_order.index(RequestLogMiddleware)


def test_platform_observability_overview_route_is_retired() -> None:
    paths = {route.path for route in system_observability_router.routes if isinstance(route, APIRoute)}

    assert "/overview" not in paths


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "route_tag",
    ["internal.system.observability", "domain.observability"],
)
async def test_observability_query_tags_exclude_dashboard_self_polling(route_tag: str) -> None:
    async def app(scope, receive, send) -> None:  # pragma: no cover - constructor dependency only
        raise AssertionError("app should not be called")

    middleware = RequestLogMiddleware(app, api_path_prefix="/api")
    scope = _scope(route_tag=route_tag)

    with patch("src.core.middleware.request_log.events.publish", new_callable=AsyncMock) as publish:
        await middleware._record_observability(
            scope=scope,
            request=Request(scope),
            status=200,
            elapsed_ms=12,
            request_bytes=0,
            response_bytes=0,
        )

    publish.assert_not_awaited()
