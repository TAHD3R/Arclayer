from __future__ import annotations

from math import ceil
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter
from starlette.requests import Request
from starlette.responses import Response
from starlette.status import HTTP_429_TOO_MANY_REQUESTS

from apps.api.config import Settings, get_settings
from apps.api.core.logging import get_logger

logger = get_logger(__name__)


async def default_identifier(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return f"{ip}:{request.scope.get('path', '')}"


async def default_callback(request: Request, response: Response, pexpire: int) -> None:
    expire = ceil(pexpire / 1000)
    detail: dict[str, Any] = {"message": "请求过于频繁", "error": "RATE_LIMITED"}
    raise HTTPException(
        HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
        headers={"Retry-After": str(expire)},
    )


def rate_limit(times: int, seconds: int) -> Any:
    async def _dependency(
        request: Request,
        response: Response,
        settings: Settings = Depends(get_settings),
    ) -> None:
        if not settings.valkey.enabled or not settings.valkey.limiter_enabled:
            return
        if FastAPILimiter.redis is None:
            logger.warning("Rate limiter not initialized", path=request.url.path)
            return
        limiter = RateLimiter(times=times, seconds=seconds)
        await limiter(request, response)

    return Depends(_dependency)


async def init_rate_limiter(app: FastAPI, settings: Settings) -> None:
    if not settings.valkey.enabled:
        logger.info("Rate limiter init skipped (valkey disabled)")
        return
    if not settings.valkey.limiter_enabled:
        logger.info("Rate limiter init skipped (limiter disabled)")
        return

    client = getattr(app.state, "valkey", None)
    if client is None:
        raise RuntimeError("Valkey client is not initialized")

    await FastAPILimiter.init(
        client.raw,
        prefix=settings.valkey.limiter_prefix,
        identifier=default_identifier,
        http_callback=default_callback,
    )
    logger.info("Rate limiter initialized", prefix=settings.valkey.limiter_prefix)


async def close_rate_limiter(app: FastAPI) -> None:
    if not FastAPILimiter.redis:
        return
    client = getattr(app.state, "valkey", None)
    if client is not None and FastAPILimiter.redis is client.raw:
        FastAPILimiter.redis = None
        FastAPILimiter.lua_sha = None
        FastAPILimiter.prefix = None
        FastAPILimiter.identifier = None
        FastAPILimiter.http_callback = None
        FastAPILimiter.ws_callback = None
        return
    await FastAPILimiter.close()
