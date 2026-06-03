"""Middleware that extracts workspace_id from the URL path and sets it on request.state.

This bridges the gap between the current project's route-dependency-based
workspace resolution and the dispatcher's need for request.state.workspace_id.

Placement: after CorrelationIdMiddleware, before TenantAwareExtensionMiddlewareDispatcher.
"""

from __future__ import annotations

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from src.common.utils.routing import extract_workspace_id_from_path


class WorkspaceContextMiddleware:
    """Extracts workspace_id from the URL path and sets it on request.state.

    Uses the same extraction logic as LocaleMiddleware so workspace-scoped
    requests are identified before route dependencies run.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        ws_id = extract_workspace_id_from_path(path)

        if ws_id is not None:
            # Set on scope state so downstream middleware (dispatcher) and
            # routes can read it.
            request = Request(scope, receive)
            request.state.workspace_id = ws_id

        await self.app(scope, receive, send)
