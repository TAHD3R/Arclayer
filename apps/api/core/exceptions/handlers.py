from __future__ import annotations

import asyncio
from typing import Any

from asgi_correlation_id import correlation_id
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import ORJSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from apps.api.config import Settings
from apps.api.core.exceptions.types import APIError
from apps.api.core.logging import logger
from apps.api.core.response import Response

_HTTP_ERROR_MAP = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
}


def _trace_meta(request: Request) -> dict[str, Any]:
    return {
        "request_id": correlation_id.get() or "-",
        "method": request.method,
        "path": request.url.path,
    }


def _build_response(
    *,
    request: Request,
    status_code: int,
    message: str,
    error: str | None,
    details: Any | None,
    debug: bool,
    headers: dict[str, str] | None = None,
) -> ORJSONResponse:
    meta = _trace_meta(request) if debug else None
    if debug and details is not None:
        meta = {**(meta or {}), "details": details}
    payload = Response.fail(message=message, error=error, meta=meta)
    return ORJSONResponse(payload.model_dump(), status_code=status_code, headers=headers)


def init_exception_handlers(app: FastAPI, settings: Settings) -> None:  # noqa: C901
    debug = settings.debug

    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError) -> ORJSONResponse:
        log_fields = {
            "method": request.method,
            "path": request.url.path,
            "status": exc.status_code,
            "error": exc.error,
        }
        if exc.status_code >= 500:
            logger.exception("APIError", **log_fields)
        else:
            logger.warning("APIError", **log_fields)
        return _build_response(
            request=request,
            status_code=exc.status_code,
            message=exc.message,
            error=exc.error,
            details=exc.details,
            debug=debug,
            headers=exc.headers,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> ORJSONResponse:
        log_fields = {
            "method": request.method,
            "path": request.url.path,
            "status": exc.status_code,
        }
        if exc.status_code >= 500:
            logger.exception("HTTPException", **log_fields)
        else:
            logger.warning("HTTPException", **log_fields)

        message = "请求错误"
        error: str | None = None
        details: Any | None = None

        if isinstance(exc.detail, dict):
            message = str(exc.detail.get("message") or exc.detail.get("detail") or message)
            error = exc.detail.get("error")
            details = exc.detail.get("details")
        elif exc.detail:
            message = str(exc.detail)

        if error is None:
            error = _HTTP_ERROR_MAP.get(exc.status_code, "INTERNAL_ERROR" if exc.status_code >= 500 else "HTTP_ERROR")

        return _build_response(
            request=request,
            status_code=exc.status_code,
            message=message,
            error=error,
            details=details,
            debug=debug,
            headers=dict(exc.headers) if exc.headers is not None else None,
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> ORJSONResponse:
        logger.warning("RequestValidationError", method=request.method, path=request.url.path)
        return _build_response(
            request=request,
            status_code=422,
            message="参数校验失败",
            error="VALIDATION_ERROR",
            details=exc.errors(),
            debug=debug,
        )

    @app.exception_handler(ValidationError)
    async def pydantic_validation_handler(request: Request, exc: ValidationError) -> ORJSONResponse:
        logger.warning("PydanticValidationError", method=request.method, path=request.url.path)
        return _build_response(
            request=request,
            status_code=422,
            message="参数校验失败",
            error="VALIDATION_ERROR",
            details=exc.errors(),
            debug=debug,
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> ORJSONResponse:
        if isinstance(exc, asyncio.CancelledError):
            raise
        logger.exception("UnhandledError", method=request.method, path=request.url.path)
        message = str(exc) if debug else "服务器内部错误"
        return _build_response(
            request=request,
            status_code=500,
            message=message,
            error="INTERNAL_ERROR",
            details=None,
            debug=debug,
        )
