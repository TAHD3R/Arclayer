from __future__ import annotations

from typing import Any


class APIError(Exception):
    def __init__(
        self,
        message: str,
        *,
        error: str | None = None,
        status_code: int = 400,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.message = message
        self.error = error
        self.status_code = status_code
        self.details = details
        self.headers = headers
        super().__init__(message)


class BadRequest(APIError):
    def __init__(
        self,
        message: str = "请求错误",
        *,
        error: str | None = None,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            message,
            error=error or "BAD_REQUEST",
            status_code=400,
            details=details,
            headers=headers,
        )


class Unauthorized(APIError):
    def __init__(
        self,
        message: str = "未授权",
        *,
        error: str | None = None,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            message,
            error=error or "UNAUTHORIZED",
            status_code=401,
            details=details,
            headers=headers,
        )


class Forbidden(APIError):
    def __init__(
        self,
        message: str = "禁止访问",
        *,
        error: str | None = None,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            message,
            error=error or "FORBIDDEN",
            status_code=403,
            details=details,
            headers=headers,
        )


class NotFound(APIError):
    def __init__(
        self,
        message: str = "资源不存在",
        *,
        error: str | None = None,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            message,
            error=error or "NOT_FOUND",
            status_code=404,
            details=details,
            headers=headers,
        )


class Conflict(APIError):
    def __init__(
        self,
        message: str = "资源冲突",
        *,
        error: str | None = None,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            message,
            error=error or "CONFLICT",
            status_code=409,
            details=details,
            headers=headers,
        )


class TooManyRequests(APIError):
    def __init__(
        self,
        message: str = "过多请求",
        *,
        error: str | None = None,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            message,
            error=error or "TOO_MANY_REQUESTS",
            status_code=429,
            details=details,
            headers=headers,
        )


class InternalServerError(APIError):
    def __init__(
        self,
        message: str = "服务器内部错误",
        *,
        error: str | None = None,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            message,
            error=error or "INTERNAL_SERVER_ERROR",
            status_code=500,
            details=details,
            headers=headers,
        )


class ServiceUnavailable(APIError):
    def __init__(
        self,
        message: str = "服务不可用",
        *,
        error: str | None = None,
        details: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            message,
            error=error or "SERVICE_UNAVAILABLE",
            status_code=503,
            details=details,
            headers=headers,
        )
