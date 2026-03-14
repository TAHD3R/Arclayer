from __future__ import annotations

import asyncio
from typing import Any

from asgi_correlation_id import correlation_id
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from starlette.responses import JSONResponse
from tortoise.exceptions import OperationalError

from apps.api.src.config import Settings
from apps.api.src.core.exceptions.types import APIError
from apps.api.src.core.http.response import Response
from apps.api.src.core.i18n import get_request_locale, localize_message
from apps.api.src.core.logging import get_logger

_HTTP_ERROR_MAP = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
}

logger = get_logger(__name__)


def _exc_info_tuple(exc: BaseException) -> tuple[type[BaseException], BaseException, Any] | None:
    """
    Build an explicit exc_info tuple for logging.

    Rationale: FastAPI/Starlette exception handlers are not always executed inside the original
    `except` block scope, so relying on `logger.exception(..., exc_info=True)` can occasionally
    lose the traceback. Passing an explicit tuple guarantees stack capture for JSON logs.
    """

    tb = getattr(exc, "__traceback__", None)
    if tb is None:
        return None
    return (type(exc), exc, tb)


def _trace_meta(request: Request) -> dict[str, Any]:
    return {
        "trace_id": correlation_id.get() or "-",
        "method": request.method,
        "path": request.url.path,
    }


def _sanitize_details(details: Any) -> Any:
    if details is None:
        return None
    if isinstance(details, (str, int, float, bool)):
        return details
    if isinstance(details, Exception):
        return str(details)
    if isinstance(details, dict):
        return {str(key): _sanitize_details(value) for key, value in details.items()}
    if isinstance(details, (list, tuple, set)):
        return [_sanitize_details(value) for value in details]
    return str(details)


def _build_response(
    *,
    request: Request,
    status_code: int,
    message: str,
    error: str | None,
    details: Any | None,
    meta: dict[str, Any] | None = None,
    debug: bool,
    include_details: bool = False,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    # meta is used for "client-visible" structured metadata (e.g. org candidates).
    # Trace info is only included when debug is enabled to avoid leaking internals.
    out_meta: dict[str, Any] | None = None

    if meta is not None:
        out_meta = _sanitize_details(meta)  # type: ignore[assignment]
        if not isinstance(out_meta, dict):
            # Defensive: meta should always be a dict, but don't break responses if misused.
            out_meta = {"meta": out_meta}

    if debug:
        trace = _trace_meta(request)
        out_meta = {**(out_meta or {}), **trace}

    if (debug or include_details) and details is not None:
        out_meta = {**(out_meta or {}), "details": _sanitize_details(details)}

    if out_meta == {}:
        out_meta = None

    locale = get_request_locale(request)
    message = localize_message(message, error=error, locale=locale)
    payload = Response.fail(message=message, error=error, meta=out_meta)
    return JSONResponse(payload.model_dump(), status_code=status_code, headers=headers)


def init_exception_handlers(app: FastAPI, settings: Settings) -> None:
    debug = settings.debug

    async def _handle_internal_error(request: Request, exc: Exception) -> JSONResponse:
        """
        A single implementation for "unexpected" errors.

        Why this exists:
        - Depending on Starlette/FastAPI versions, a generic `@app.exception_handler(Exception)`
          may not always be selected for subclasses (e.g. RuntimeError).
        - A status-code handler for 500 is used by Starlette's ServerErrorMiddleware and provides
          a reliable fallback to return our JSON error envelope.
        """

        if isinstance(exc, asyncio.CancelledError):
            raise

        request.state.error_code = "INTERNAL_ERROR"
        request.state.error_message = "Internal server error"
        logger.exception(
            "UnhandledError",
            exc_info=_exc_info_tuple(exc),
            method=request.method,
            path=request.url.path,
        )
        # Never leak internal exception messages to clients (even in debug).
        # Developers still get trace_id + details via response meta when debug is enabled.
        message = "Internal server error"
        return _build_response(
            request=request,
            status_code=500,
            message=message,
            error="INTERNAL_ERROR",
            details=str(exc) if debug else None,
            debug=debug,
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        return await _handle_internal_error(request, exc)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        log_fields = {
            "method": request.method,
            "path": request.url.path,
            "status": exc.status_code,
        }
        if exc.status_code >= 500:
            logger.exception("HTTPException", exc_info=_exc_info_tuple(exc), **log_fields)

        message = "Bad request"
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

        request.state.error_code = error
        request.state.error_message = message
        return _build_response(
            request=request,
            status_code=exc.status_code,
            message=message,
            error=error,
            details=details,
            debug=debug,
            headers=dict(exc.headers) if exc.headers is not None else None,
        )

    @app.exception_handler(OperationalError)
    async def tortoise_operational_handler(request: Request, exc: OperationalError) -> JSONResponse:
        request.state.error_code = "DB_OPERATIONAL_ERROR"
        request.state.error_message = "Database operation failed"
        logger.exception(
            "DBOperationalError",
            exc_info=_exc_info_tuple(exc),
            method=request.method,
            path=request.url.path,
        )
        return _build_response(
            request=request,
            status_code=500,
            message="Database operation failed",
            error="DB_OPERATIONAL_ERROR",
            details=str(exc) if debug else None,
            debug=debug,
        )

    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
        request.state.error_code = exc.error
        request.state.error_message = exc.message
        log_fields = {
            "method": request.method,
            "path": request.url.path,
            "status": exc.status_code,
            "error": exc.error,
        }
        if exc.status_code >= 500:
            logger.exception("APIError", exc_info=_exc_info_tuple(exc), **log_fields)
        return _build_response(
            request=request,
            status_code=exc.status_code,
            message=exc.message,
            error=exc.error,
            details=exc.details,
            meta=exc.meta,
            debug=debug,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        request.state.error_code = "VALIDATION_ERROR"
        request.state.error_message = "Validation failed"
        return _build_response(
            request=request,
            status_code=422,
            message="Validation failed",
            error="VALIDATION_ERROR",
            details=exc.errors(),
            debug=debug,
            include_details=True,
        )

    @app.exception_handler(ValidationError)
    async def pydantic_validation_handler(request: Request, exc: ValidationError) -> JSONResponse:
        request.state.error_code = "VALIDATION_ERROR"
        request.state.error_message = "Validation failed"
        return _build_response(
            request=request,
            status_code=422,
            message="Validation failed",
            error="VALIDATION_ERROR",
            details=exc.errors(),
            debug=debug,
            include_details=True,
        )
