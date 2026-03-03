from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi_limiter.depends import RateLimiter
from pyrate_limiter import Duration, Limiter, Rate
from starlette.requests import Request
from starlette.responses import Response
from starlette.status import HTTP_429_TOO_MANY_REQUESTS

from apps.api.src.config import Settings, get_settings
from apps.api.src.core.i18n import t
from apps.api.src.core.logging import get_logger

logger = get_logger(__name__)


async def default_identifier(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return f"{ip}:{request.scope.get('path', '')}"


def default_callback(*args: Any, **kwargs: Any) -> None:
    # Keep callback lightweight: fastapi-limiter expects callbacks to raise HTTPException.
    # (It's fine for this to be sync because it always raises.)
    _ = args, kwargs
    detail: dict[str, Any] = {
        "message": t("errors", "RATE_LIMITED", default="请求过于频繁"),
        "error": "RATE_LIMITED",
    }
    raise HTTPException(
        HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
    )


def rate_limit(times: int, seconds: int) -> Any:
    limiter = Limiter(Rate(times, Duration.SECOND * seconds))

    async def _identifier(request: Request) -> str:
        # fastapi-limiter uses `identifier + route_index + dep_index` as the bucket key.
        # Our `rate_limit()` wraps RateLimiter in another dependency, so dep_index may not
        # distinguish multiple limiters; we include times/seconds to avoid collisions.
        base = await default_identifier(request)
        return f"{base}:{times}:{seconds}"

    dep = RateLimiter(limiter=limiter, identifier=_identifier, callback=default_callback)

    async def _dependency(
        request: Request,
        response: Response,
        settings: Settings = Depends(get_settings),
    ) -> None:
        if not settings.valkey.enabled or not settings.valkey.limiter_enabled:
            return
        await dep(request, response)

    return Depends(_dependency)


async def init_rate_limiter(app: FastAPI, settings: Settings) -> None:
    if not settings.valkey.enabled or not settings.valkey.limiter_enabled:
        logger.info(
            "Rate limiter init skipped",
            enabled=settings.valkey.enabled,
            limiter_enabled=settings.valkey.limiter_enabled,
        )
        return
    _ = app
    logger.info("Rate limiter enabled")


async def close_rate_limiter(app: FastAPI) -> None:
    _ = app
    return
