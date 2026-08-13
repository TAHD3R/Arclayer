from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Any

from asgi_correlation_id import correlation_id
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from starlette.responses import JSONResponse
from tortoise.exceptions import OperationalError

from src.config import Settings
from src.core.exceptions.types import APIError
from src.core.http.response import ApiResponse
from src.core.i18n import get_request_locale, localize_message
from src.core.logging import get_logger

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


def _http_error_code_for_status(status_code: int) -> str:
    return _HTTP_ERROR_MAP.get(
        status_code,
        "INTERNAL_ERROR" if status_code >= 500 else "HTTP_ERROR",
    )


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


def _normalize_validation_details(details: Sequence[Any], *, locale: str) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for detail in details:
        if not isinstance(detail, dict):
            continue
        raw_code = _scalar_to_str(detail.get("type")) or "VALIDATION_ERROR"
        code = raw_code.upper()
        raw_message = _scalar_to_str(detail.get("msg")) or code
        loc = detail.get("loc")
        normalized.append({
            "code": code,
            "loc": _sanitize_details(loc) if isinstance(loc, (list, tuple)) else [],
            "message": localize_message(raw_message, error=code, locale=locale),
        })
    return normalized


def _scalar_to_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        text = str(value).strip()
        return text or None
    return None


def _normalize_http_exception_detail(
    detail: Any,
    *,
    status_code: int,
) -> tuple[str, str, Any | None]:
    default_error = _http_error_code_for_status(status_code)

    if isinstance(detail, dict):
        raw_error = detail.get("error")
        raw_details = detail.get("details")
        raw_message = detail.get("message") or detail.get("detail")

        nested_error_message: Any | None = None
        nested_error_details: Any | None = None
        if isinstance(raw_error, dict):
            error = (
                _scalar_to_str(raw_error.get("code"))
                or _scalar_to_str(raw_error.get("error"))
                or _scalar_to_str(raw_error.get("type"))
                or default_error
            )
            nested_error_message = raw_error.get("message")
            nested_error_details = raw_error.get("details")
        else:
            error = _scalar_to_str(raw_error) or default_error

        message = _scalar_to_str(raw_message) or _scalar_to_str(nested_error_message) or default_error
        details = raw_details if raw_details is not None else nested_error_details
        return message, error, details

    message = _scalar_to_str(detail) or default_error
    return message, default_error, None


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
    payload = ApiResponse.fail(message=message, error=error, meta=out_meta)
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
        request.state.error_class = type(exc).__name__
        request.state.error_message = "INTERNAL_ERROR"
        logger.exception(
            "UnhandledError",
            exc_info=_exc_info_tuple(exc),
            method=request.method,
            path=request.url.path,
        )
        # Never leak internal exception messages to clients (even in debug).
        # Developers still get trace_id + details via response meta when debug is enabled.
        message = "INTERNAL_ERROR"
        return _build_response(
            request=request,
            status_code=500,
            message=message,
            error="INTERNAL_ERROR",
            details=None,
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

        message, error, details = _normalize_http_exception_detail(
            exc.detail,
            status_code=exc.status_code,
        )

        request.state.error_code = error
        request.state.error_class = type(exc).__name__
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
        request.state.error_class = type(exc).__name__
        request.state.error_message = "DB_OPERATIONAL_ERROR"
        message = str(request.state.error_message)
        logger.exception(
            "DBOperationalError",
            exc_info=_exc_info_tuple(exc),
            method=request.method,
            path=request.url.path,
        )
        return _build_response(
            request=request,
            status_code=500,
            message=message,
            error="DB_OPERATIONAL_ERROR",
            details=None,
            debug=debug,
        )

    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
        request.state.error_code = exc.error
        request.state.error_class = type(exc).__name__
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
        request.state.error_class = type(exc).__name__
        request.state.error_message = "VALIDATION_ERROR"
        message = str(request.state.error_message)
        return _build_response(
            request=request,
            status_code=422,
            message=message,
            error="VALIDATION_ERROR",
            details=_normalize_validation_details(
                exc.errors(),
                locale=get_request_locale(request),
            ),
            debug=debug,
            include_details=True,
        )

    @app.exception_handler(ValidationError)
    async def pydantic_validation_handler(request: Request, exc: ValidationError) -> JSONResponse:
        request.state.error_code = "VALIDATION_ERROR"
        request.state.error_class = type(exc).__name__
        request.state.error_message = "VALIDATION_ERROR"
        message = str(request.state.error_message)
        return _build_response(
            request=request,
            status_code=422,
            message=message,
            error="VALIDATION_ERROR",
            details=_normalize_validation_details(
                exc.errors(),
                locale=get_request_locale(request),
            ),
            debug=debug,
            include_details=True,
        )
