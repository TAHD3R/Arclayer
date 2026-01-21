from __future__ import annotations

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from apps.api.core.i18n import get_request_locale, reset_current_locale, set_current_locale


class LocaleMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        locale = get_request_locale(request)
        token = set_current_locale(locale)
        try:
            return await call_next(request)
        finally:
            reset_current_locale(token)
