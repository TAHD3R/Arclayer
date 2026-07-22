from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from asgi_correlation_id import correlation_id
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from structlog.contextvars import bind_contextvars, clear_contextvars, get_contextvars

from src.core.events import Event, events
from src.core.logging import get_logger
from src.modules.observability.http_metrics import HTTP_REQUEST_METRIC_EVENT, is_observability_query_route

logger = get_logger(__name__)


class RequestLogMiddleware:
    """
    Request logging middleware implemented in native ASGI style.

    Rationale: Starlette's BaseHTTPMiddleware has known edge cases around exceptions
    that can lead to hanging requests. Using plain ASGI keeps exception handling reliable.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        trace_header_name: str = "X-Trace-Id",
        omit_paths: list[str] | None = None,
        omit_path_prefixes: list[str] | None = None,
        api_path_prefix: str = "/api",
        database_enabled: bool = True,
        observability_enabled: bool = True,
    ) -> None:
        self.app = app
        self._trace_header_name = trace_header_name
        self._omit_paths = set(omit_paths or [])
        self._omit_path_prefixes = tuple(p for p in (omit_path_prefixes or []) if p)
        self._api_path_prefix = api_path_prefix.rstrip("/") or "/api"
        self._metrics_enabled = database_enabled and observability_enabled

    @staticmethod
    def _parse_context_uuid(value: object | None) -> UUID | None:
        if value is None:
            return None
        try:
            return UUID(str(value))
        except ValueError:
            return None

    async def _record_observability(
        self,
        *,
        scope: Scope,
        request: Request,
        status: int,
        elapsed_ms: int,
    ) -> None:
        if not self._metrics_enabled or not request.url.path.startswith(f"{self._api_path_prefix}/"):
            return

        route = scope.get("route")
        if is_observability_query_route(route):
            return

        context = get_contextvars()
        state = scope.get("state") or {}
        workspace_id = self._parse_context_uuid(
            context.get("tenant_workspace_id") or context.get("workspace_id") or state.get("workspace_id")
        )
        project_id = self._parse_context_uuid(context.get("tenant_project_id") or context.get("project_id"))
        actor_user_id = self._parse_context_uuid(context.get("user_id") or context.get("actor_user_id"))
        route_template = str(getattr(route, "path", None) or "__unmatched__")

        try:
            await events.publish(
                Event(
                    name=HTTP_REQUEST_METRIC_EVENT,
                    source="request_log",
                    trace_id=str(correlation_id.get(None) or "") or None,
                    actor_user_id=str(actor_user_id) if actor_user_id is not None else None,
                    payload={
                        "workspaceId": str(workspace_id) if workspace_id is not None else None,
                        "projectId": str(project_id) if project_id is not None else None,
                        "routeTemplate": route_template,
                        "method": request.method.upper(),
                        "statusCode": status,
                        "durationMs": elapsed_ms,
                    },
                )
            )
        except Exception:
            logger.exception(
                "Failed to publish HTTP request metric",
                method=request.method,
                route_template=route_template,
                status=status,
            )

    def _should_omit_summary(self, request: Request, *, status: int) -> bool:
        # Omit low-value noise for health checks / static assets, but never hide 5xx signals.
        if status >= 500:
            return False
        if request.method.upper() == "OPTIONS":
            return True
        path = request.url.path
        if path in self._omit_paths:
            return True
        return any(path.startswith(prefix) for prefix in self._omit_path_prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)

        # Avoid leaking context (user_id/entity_id/etc) across requests.
        clear_contextvars()
        cid = correlation_id.get(None)
        if cid:
            bind_contextvars(trace_id=cid)

        start = time.perf_counter()
        status: int | None = None

        async def _send(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message.get("status") or 0)
                if cid and self._trace_header_name:
                    headers = list(message.get("headers") or [])
                    headers.append((self._trace_header_name.lower().encode("ascii"), str(cid).encode("ascii")))
                    message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, _send)
        finally:
            elapsed_ms = int((time.perf_counter() - start) * 1000)

            final_status = int(status or 0)
            method = request.method
            path = request.url.path

            if not self._should_omit_summary(request, status=final_status):
                # Exception handlers set these fields on `request.state`.
                state = scope.get("state") or {}
                error_code = state.get("error_code")
                error_message = state.get("error_message")

                # Keep the summary log lightweight and safe:
                # - Do not log request body
                # - Do not log headers (Authorization/Cookie/etc)
                fields: dict[str, Any] = {
                    "method": method,
                    "path": path,
                    "status": final_status,
                    "elapsed_ms": elapsed_ms,
                }
                if error_code:
                    fields["error"] = error_code
                if error_message:
                    fields["message"] = error_message

                # Leveling strategy:
                # - 2xx/3xx -> info
                # - 401/403 -> info (expected authz noise)
                # - other 4xx -> warning
                # - 5xx -> error (stack is logged by exception handler)
                if final_status >= 500:
                    logger.error("HTTP request failed", **fields)
                elif final_status in (401, 403):
                    logger.info("HTTP request rejected", **fields)
                elif final_status >= 400:
                    logger.warning("HTTP request failed", **fields)
                else:
                    logger.info("HTTP request completed", **fields)
            await self._record_observability(
                scope=scope,
                request=request,
                status=final_status,
                elapsed_ms=elapsed_ms,
            )
            clear_contextvars()
