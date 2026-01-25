from __future__ import annotations

import time
from typing import Any

from asgi_correlation_id import correlation_id
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from structlog.contextvars import bind_contextvars, clear_contextvars

from apps.api.core.logging import get_logger

logger = get_logger(__name__)


class RequestLogMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        trace_header_name: str = "X-Trace-Id",
        omit_paths: list[str] | None = None,
        omit_path_prefixes: list[str] | None = None,
    ) -> None:
        super().__init__(app)
        self._trace_header_name = trace_header_name
        self._omit_paths = set(omit_paths or [])
        self._omit_path_prefixes = tuple(p for p in (omit_path_prefixes or []) if p)

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

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Avoid leaking context (user_id/entity_id/etc) across requests.
        clear_contextvars()
        cid = correlation_id.get(None)
        if cid:
            bind_contextvars(trace_id=cid)

        start = time.perf_counter()
        try:
            response = await call_next(request)
            elapsed_ms = int((time.perf_counter() - start) * 1000)

            status = int(getattr(response, "status_code", 0) or 0)
            method = request.method
            path = request.url.path

            # Echo trace id back to clients for debugging / support tickets.
            # Note: for browsers to read it, make sure CORS `expose_headers` includes this header.
            if cid and self._trace_header_name:
                response.headers[self._trace_header_name] = cid

            if self._should_omit_summary(request, status=status):
                return response

            error_code = getattr(request.state, "error_code", None)
            error_message = getattr(request.state, "error_message", None)

            # Keep the summary log lightweight and safe:
            # - Do not log request body
            # - Do not log headers (Authorization/Cookie/etc)
            fields: dict[str, Any] = {
                "method": method,
                "path": path,
                "status": status,
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
            if status >= 500:
                logger.error("HTTP request failed", **fields)
            elif status in (401, 403):
                logger.info("HTTP request rejected", **fields)
            elif status >= 400:
                logger.warning("HTTP request failed", **fields)
            else:
                logger.info("HTTP request completed", **fields)

            return response
        finally:
            clear_contextvars()
