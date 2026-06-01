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


class TokenBucket:
    """Local token bucket for single-process rate limiting.

    Used as a fast-path check before hitting the distributed Valkey limiter,
    and as a standalone rate limiter when Valkey is unavailable.
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

    Uses a sliding window approach with sorted sets for accuracy.
    Falls back to local-only limiting when Valkey is unreachable.
    """

    def __init__(
        self,
        *,
        valkey_client=None,
        prefix: str = "arclayer:ratelimit",
        capacity: int = 100,
        window_seconds: int = 60,
        fallback_bucket: TokenBucket | None = None,
    ) -> None:
        self._valkey = valkey_client
        self._prefix = prefix
        self._capacity = capacity
        self._window = window_seconds
        self._local = fallback_bucket or TokenBucket(
            capacity=capacity,
            refill_rate=capacity / window_seconds,
        )

    async def is_allowed(self, key: str, *, cost: int = 1) -> bool:
        """Check if a request identified by `key` is allowed under the rate limit.

        Returns True if allowed, False if rate limited.
        """
        # Fast path: local check first.
        if not self._local.consume(cost):
            return False

        # Distributed check with Valkey.
        if self._valkey is not None:
            return await self._check_distributed(key, cost)

        return True

    async def _check_distributed(self, key: str, cost: int) -> bool:
        now = time.time()
        window_start = now - self._window
        rkey = f"{self._prefix}:{key}"

        try:
            raw = self._valkey.raw if hasattr(self._valkey, "raw") else self._valkey
            async with raw.pipeline() as pipe:
                pipe.zremrangebyscore(rkey, 0, window_start)
                pipe.zcard(rkey)
                results = await pipe.execute()

            current = results[1]
            if current + cost <= self._capacity:
                await raw.zadd(rkey, {str(now): now})
                await raw.expire(rkey, self._window + 1)
                return True
            return False
        except Exception:
            # Valkey unreachable — trust local check.
            return True
