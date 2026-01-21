from __future__ import annotations

import secrets
from collections.abc import Iterable

from fastapi import Request
from fastapi.responses import ORJSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from apps.api.core.i18n import get_request_locale, localize_message
from apps.api.core.response import Response as ResponseBuilder


class CSRFMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        *,
        header_name: str,
        cookie_name: str,
        safe_methods: Iterable[str],
        cookie_secure: bool,
        cookie_httponly: bool,
        cookie_samesite: str,
        token_bytes: int,
    ) -> None:
        super().__init__(app)
        self.header_name = header_name
        self.cookie_name = cookie_name
        self.safe_methods = {m.upper() for m in safe_methods}
        self.cookie_secure = cookie_secure
        self.cookie_httponly = cookie_httponly
        self.cookie_samesite = cookie_samesite
        self.token_bytes = max(8, token_bytes)

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method.upper() in self.safe_methods:
            response = await call_next(request)
            if self.cookie_name not in request.cookies:
                token = secrets.token_urlsafe(self.token_bytes)
                response.set_cookie(
                    self.cookie_name,
                    token,
                    secure=self.cookie_secure,
                    httponly=self.cookie_httponly,
                    samesite=self.cookie_samesite if self.cookie_samesite in {"lax", "strict", "none"} else "lax",  # type: ignore
                )
            return response

        header_token = request.headers.get(self.header_name)
        cookie_token = request.cookies.get(self.cookie_name)
        if not header_token or not cookie_token or header_token != cookie_token:
            locale = get_request_locale(request)
            message = localize_message("CSRF 校验失败", error="CSRF_FAILED", locale=locale)
            payload = ResponseBuilder.fail(
                message=message,
                error="CSRF_FAILED",
                meta={"reason": "token_mismatch"},
            )
            return ORJSONResponse(payload.model_dump(), status_code=403)

        return await call_next(request)
