from __future__ import annotations

import time

from fastapi import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from apps.api.core.i18n import get_request_locale, reset_current_locale, set_current_locale


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
    """

    try:
        # Use app.state to avoid global state across processes.
        state = request.app.state
        now = time.monotonic()
        cache = getattr(state, "_core_default_locale_cache", None)
        if isinstance(cache, dict):
            expires_at = cache.get("expires_at")
            if isinstance(expires_at, (int, float)) and expires_at > now:
                cached = cache.get("value")
                return cached if isinstance(cached, str) else None

        from apps.api.models.setting import SettingRecord
        from apps.api.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace="core"
        )
        value = record.value if record and isinstance(record.value, dict) else {}
        section = value.get("localization") if isinstance(value, dict) else None
        locale = section.get("locale") if isinstance(section, dict) else None
        locale_str = locale if isinstance(locale, str) and locale else None

        # Cache for a short TTL to reduce DB reads under load.
        state._core_default_locale_cache = {"value": locale_str, "expires_at": now + 5.0}
        return locale_str
    except Exception:
        return None
