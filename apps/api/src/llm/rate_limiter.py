"""Distributed rate limiter — Token Bucket algorithm with Valkey backend.

Provides per-workspace, per-user, and per-model rate limiting for
LLM API calls. Uses Valkey (Redis-compatible) for cross-worker
coordination.

Bucket parameters:
    - capacity: max burst size (tokens)
    - refill_rate: tokens per second
    - refill_interval: refill granularity in seconds

Phase 1: simple token bucket, no hierarchical limiting.
"""

from __future__ import annotations

import time
from typing import Any, Protocol
from uuid import uuid4


class RateLimiter(Protocol):
    async def is_allowed(self, key: str, *, cost: int = 1) -> bool: ...


class RateLimitBackendUnavailable(RuntimeError):
    """Raised when the shared rate-limit authority cannot be reached."""


class TokenBucket:
    """Legacy single-process helper retained for isolated unit tests only.

    Production AI traffic is governed by :class:`ValkeyRateLimiter`.
    """

    def __init__(
        self,
        capacity: int,
        refill_rate: float,
        *,
        refill_interval: float = 1.0,
    ) -> None:
        self._capacity = float(capacity)
        self._refill_rate = refill_rate
        self._refill_interval = refill_interval
        self._tokens = float(capacity)
        self._last_refill = time.monotonic()

    def consume(self, tokens: int = 1) -> bool:
        """Try to consume tokens. Returns True if allowed, False if rate limited."""
        self._refill()
        if self._tokens >= tokens:
            self._tokens -= tokens
            return True
        return False

    @property
    def available(self) -> float:
        self._refill()
        return self._tokens

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        intervals = int(elapsed / self._refill_interval)
        if intervals > 0:
            self._tokens = min(
                self._capacity,
                self._tokens + intervals * self._refill_rate * self._refill_interval,
            )
            self._last_refill += intervals * self._refill_interval


class ValkeyRateLimiter:
    """Distributed rate limiter backed by Valkey.

    Uses a sliding window approach with one atomic Valkey script per request.
    The script removes expired entries, checks capacity, and records the whole
    request before returning, so concurrent workers cannot oversubscribe a key.
    """

    def __init__(
        self,
        *,
        valkey_client: Any | None = None,
        prefix: str = "arclayer:ratelimit",
        capacity: int = 100,
        window_seconds: int = 60,
    ) -> None:
        if valkey_client is None:
            raise ValueError("ValkeyRateLimiter requires a Valkey client")
        self._valkey = valkey_client
        self._prefix = prefix
        self._capacity = capacity
        self._window = window_seconds
        if capacity < 1:
            raise ValueError("capacity must be positive")
        if window_seconds < 1:
            raise ValueError("window_seconds must be positive")

    async def is_allowed(self, key: str, *, cost: int = 1) -> bool:
        """Check if a request identified by `key` is allowed under the rate limit.

        Returns True if allowed, False if rate limited.
        """
        if cost < 1:
            raise ValueError("cost must be positive")
        return await self._check_distributed(key, cost)

    async def _check_distributed(self, key: str, cost: int) -> bool:
        now = time.time()
        window_start = now - self._window
        rkey = self._key(key)
        member_prefix = uuid4().hex
        script = """
        redis.call('zremrangebyscore', KEYS[1], 0, ARGV[1])
        local current = redis.call('zcard', KEYS[1])
        local cost = tonumber(ARGV[3])
        if current + cost > tonumber(ARGV[4]) then
            return 0
        end
        for index = 1, cost do
            redis.call('zadd', KEYS[1], ARGV[2], ARGV[6] .. ':' .. index)
        end
        redis.call('expire', KEYS[1], ARGV[5])
        return 1
        """

        try:
            valkey = self._valkey
            raw: Any = valkey.raw if hasattr(valkey, "raw") else valkey
            result = await raw.eval(
                script,
                1,
                rkey,
                window_start,
                now,
                cost,
                self._capacity,
                self._window + 1,
                member_prefix,
            )
            return bool(int(result))
        except Exception as exc:
            raise RateLimitBackendUnavailable("Valkey rate-limit operation failed") from exc

    def _key(self, key: str) -> str:
        if hasattr(self._valkey, "key"):
            return str(self._valkey.key(self._prefix, key))
        return f"{self._prefix}:{key}"
