from __future__ import annotations

import time
from uuid import UUID

from fastapi import Request
from starlette.types import ASGIApp, Receive, Scope, Send
from tortoise.exceptions import ConfigurationError, OperationalError

from apps.api.core.i18n import get_request_locale, reset_current_locale, set_current_locale
from apps.api.settings.locale_runtime import read_core_default_locale


class LocaleMiddleware:
    """
    Locale middleware implemented in native ASGI style.

    Rationale: Starlette's BaseHTTPMiddleware has edge cases around exception handling
    that can cause hanging requests. Using plain ASGI avoids those issues.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        # If the client doesn't specify locale, fall back to core settings (best-effort).
        # Prefer workspace-scoped default locale when the request is workspace-scoped.
        default_locale = await _get_core_default_locale(request)
        locale = get_request_locale(request, default_locale=default_locale)
        token = set_current_locale(locale)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_current_locale(token)


async def _get_core_default_locale(request: Request) -> str | None:
    """
    Best-effort: read default locale from core settings (DB), with a tiny in-memory TTL cache.

    Priority:
    1) Workspace-scoped core settings (when URL contains /workspaces/{workspace_id}/...)
    2) System-scoped core settings (global fallback)
    """

    try:
        # Use app.state to avoid global state across processes.
        state = request.app.state
        now = time.monotonic()
        path = request.url.path

        workspace_id = _extract_workspace_id_from_path(path)
        if workspace_id is not None:
            cache = getattr(state, "_workspace_default_locale_cache", None)
            if isinstance(cache, dict):
                entry = cache.get(str(workspace_id))
                if isinstance(entry, dict):
                    expires_at = entry.get("expires_at")
                    if isinstance(expires_at, (int, float)) and expires_at > now:
                        cached = entry.get("value")
                        return cached if isinstance(cached, str) else None

            locale_str = await _read_core_locale(scope_type="workspace", scope_id=workspace_id)
            if not hasattr(state, "_workspace_default_locale_cache") or not isinstance(
                getattr(state, "_workspace_default_locale_cache", None), dict
            ):
                state._workspace_default_locale_cache = {}
            state._workspace_default_locale_cache[str(workspace_id)] = {
                "value": locale_str,
                "expires_at": now + 5.0,
            }
            if locale_str:
                return locale_str

        cache = getattr(state, "_system_default_locale_cache", None)
        if isinstance(cache, dict):
            expires_at = cache.get("expires_at")
            if isinstance(expires_at, (int, float)) and expires_at > now:
                cached = cache.get("value")
                return cached if isinstance(cached, str) else None

        locale_str = await _read_core_locale(scope_type="system", scope_id=None)
        # Cache for a short TTL to reduce DB reads under load.
        state._system_default_locale_cache = {"value": locale_str, "expires_at": now + 5.0}
        return locale_str
    except (AttributeError, ConfigurationError, OperationalError, RuntimeError, TypeError, ValueError):
        return None


def _extract_workspace_id_from_path(path: str) -> UUID | None:
    """
    Parse v2 workspace-scoped API URL:
    /api/v1/workspaces/{workspace_id}/...
    """

    marker = "/workspaces/"
    if marker not in path:
        return None
    try:
        _, tail = path.split(marker, 1)
        raw = tail.split("/", 1)[0].strip()
        return UUID(raw)
    except (IndexError, ValueError):
        return None


async def _read_core_locale(*, scope_type: str, scope_id: UUID | None) -> str | None:
    if scope_type == "workspace":
        return await read_core_default_locale(scope_type="workspace", scope_id=scope_id)
    return await read_core_default_locale(scope_type="system", scope_id=None)
