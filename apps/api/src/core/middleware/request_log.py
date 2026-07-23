from __future__ import annotations

import ipaddress
import time
from typing import Any
from uuid import UUID

from asgi_correlation_id import correlation_id
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from structlog.contextvars import bind_contextvars, clear_contextvars, get_contextvars

from src.core.events import Event, events
from src.core.logging import get_logger
from src.modules.auth.sessions.device_label import detect_browser_family, detect_device_family
from src.modules.observability.http_metrics import HTTP_REQUEST_METRIC_EVENT, is_observability_query_route

logger = get_logger(__name__)


def _bounded_text(value: object | None, *, max_length: int) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized[:max_length] if normalized else None


def _privacy_preserving_network(client_host: str | None) -> str | None:
    if client_host is None:
        return None
    try:
        address = ipaddress.ip_address(client_host)
    except ValueError:
        return None
    prefix = 24 if address.version == 4 else 64
    return str(ipaddress.ip_network(f"{address}/{prefix}", strict=False))


def _w3c_trace_id(traceparent: str | None) -> str | None:
    parts = (traceparent or "").strip().split("-")
    if len(parts) != 4:
        return None
    trace_id = parts[1].lower()
    if len(trace_id) != 32 or trace_id == "0" * 32:
        return None
    return trace_id if all(character in "0123456789abcdef" for character in trace_id) else None


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
        service_name: str = "Arclayer API",
        environment: str | None = None,
        release_version: str | None = None,
        instance_id: str | None = None,
        region: str | None = None,
    ) -> None:
        self.app = app
        self._trace_header_name = trace_header_name
        self._omit_paths = set(omit_paths or [])
        self._omit_path_prefixes = tuple(p for p in (omit_path_prefixes or []) if p)
        self._api_path_prefix = api_path_prefix.rstrip("/") or "/api"
        self._metrics_enabled = database_enabled and observability_enabled
        self._service_name = service_name
        self._environment = environment
        self._release_version = release_version
        self._instance_id = instance_id
        self._region = region

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
        request_bytes: int,
        response_bytes: int,
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
        request_id = _bounded_text(correlation_id.get(None), max_length=128)
        user_agent = _bounded_text(request.headers.get("user-agent"), max_length=512)
        client_host = None if request.client is None else request.client.host
        error_code = _bounded_text(state.get("error_code"), max_length=128)
        error_class = _bounded_text(state.get("error_class"), max_length=128)
        error_message = _bounded_text(state.get("error_message"), max_length=512)

        try:
            await events.publish(
                Event(
                    name=HTTP_REQUEST_METRIC_EVENT,
                    source="request_log",
                    version="2.0",
                    trace_id=request_id,
                    actor_user_id=str(actor_user_id) if actor_user_id is not None else None,
                    payload={
                        "requestId": request_id,
                        "traceId": _w3c_trace_id(request.headers.get("traceparent")),
                        "workspaceId": str(workspace_id) if workspace_id is not None else None,
                        "projectId": str(project_id) if project_id is not None else None,
                        "normalizedPath": request.url.path,
                        "routeTemplate": route_template,
                        "method": request.method.upper(),
                        "protocol": f"HTTP/{scope.get('http_version', '1.1')}",
                        "statusCode": status,
                        "durationMs": elapsed_ms,
                        "requestBytes": request_bytes,
                        "responseBytes": response_bytes,
                        "serviceName": self._service_name,
                        "upstreamName": _bounded_text(state.get("upstream_service"), max_length=128),
                        "environment": self._environment,
                        "releaseVersion": self._release_version,
                        "instanceId": self._instance_id,
                        "region": self._region,
                        "userAgentFamily": detect_browser_family(user_agent),
                        "deviceFamily": detect_device_family(user_agent),
                        "clientNetwork": _privacy_preserving_network(client_host),
                        "errorCode": error_code,
                        "errorClass": error_class,
                        "errorMessage": error_message,
                        "ingestionSource": "request_log",
                        "schemaVersion": 2,
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

        request_bytes = 0
        response_bytes = 0

        async def _receive() -> Message:
            nonlocal request_bytes
            message = await receive()
            if message["type"] == "http.request":
                request_bytes += len(message.get("body", b""))
            return message

        request = Request(scope, receive=_receive)

        # Avoid leaking context (user_id/entity_id/etc) across requests.
        clear_contextvars()
        cid = correlation_id.get(None)
        if cid:
            bind_contextvars(trace_id=cid)

        start = time.perf_counter()
        status: int | None = None

        async def _send(message: Message) -> None:
            nonlocal response_bytes, status
            if message["type"] == "http.response.start":
                status = int(message.get("status") or 0)
                if cid and self._trace_header_name:
                    headers = list(message.get("headers") or [])
                    headers.append((self._trace_header_name.lower().encode("ascii"), str(cid).encode("ascii")))
                    message["headers"] = headers
            elif message["type"] == "http.response.body":
                response_bytes += len(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, _receive, _send)
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
                request_bytes=request_bytes,
                response_bytes=response_bytes,
            )
            clear_contextvars()
