from __future__ import annotations

import hashlib
import time

from fastapi import Request

from src.core.exceptions import TooManyRequests
from src.modules.auth.content_api.service import extract_content_api_token
from src.platform.cache.valkey import get_valkey

CONTENT_API_READ_RATE_LIMIT = (60, 60)


async def enforce_content_api_rate_limit(request: Request) -> None:
    limit, window = CONTENT_API_READ_RATE_LIMIT
    key = _rate_limit_key(request)
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        count = _increment_local_rate_counter(request=request, key=key, window=window)
    else:
        count = await valkey.incr_with_ttl(key, ttl=window)
    if count > limit:
        raise TooManyRequests("Content API rate limit exceeded", error="CONTENT_API_RATE_LIMITED")


def _rate_limit_key(request: Request) -> str:
    token = extract_content_api_token(request)
    client_host = request.client.host if request.client is not None else "unknown"
    raw_identifier = token or client_host
    digest = hashlib.sha256(raw_identifier.encode("utf-8")).hexdigest()
    return f"content-api:read:{request.url.path}:{digest}"


def _increment_local_rate_counter(*, request: Request, key: str, window: int) -> int:
    now = time.monotonic()
    store: dict[str, tuple[float, int]] = getattr(request.app.state, "content_api_rate_counters", {})
    reset_at, count = store.get(key, (0.0, 0))
    if reset_at <= now:
        reset_at = now + window
        count = 0
    count += 1
    store[key] = (reset_at, count)
    request.app.state.content_api_rate_counters = store
    return count
