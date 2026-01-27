from __future__ import annotations

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
        locale = get_request_locale(request)
        token = set_current_locale(locale)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_current_locale(token)
