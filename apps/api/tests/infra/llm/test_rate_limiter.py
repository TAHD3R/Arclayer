"""Tests for rate limiter (TokenBucket + ValkeyRateLimiter)."""

from __future__ import annotations

import time

import pytest

from src.llm.rate_limiter import RateLimitBackendUnavailable, TokenBucket, ValkeyRateLimiter


class _FakeRawValkey:
    def __init__(self, result=1, error: Exception | None = None):
        self.result = result
        self.error = error
        self.calls: list[tuple[object, ...]] = []

    async def eval(self, *args):
        self.calls.append(args)
        if self.error is not None:
            raise self.error
        return self.result


class _FakeValkey:
    def __init__(self, raw):
        self.raw = raw

    def key(self, *parts: str) -> str:
        return ":".join(("test", *parts))


class TestTokenBucket:
    def test_initial_capacity_is_full(self):
        bucket = TokenBucket(capacity=10, refill_rate=1.0)
        assert bucket.available == 10.0

    def test_consume_reduces_tokens(self):
        bucket = TokenBucket(capacity=10, refill_rate=1.0)
        assert bucket.consume(3)
        assert bucket.available == pytest.approx(7.0)

    def test_consume_fails_when_empty(self):
        bucket = TokenBucket(capacity=1, refill_rate=0.0)
        assert bucket.consume(1)
        assert not bucket.consume(1)

    def test_consume_default_one_token(self):
        bucket = TokenBucket(capacity=5, refill_rate=0.0)
        assert bucket.consume()
        assert bucket.available == pytest.approx(4.0)

    def test_refill_over_time(self):
        bucket = TokenBucket(capacity=10, refill_rate=2.0, refill_interval=0.1)
        bucket.consume(10)  # Empty it
        assert bucket.available == pytest.approx(0.0)
        time.sleep(0.3)  # Wait for 3 intervals → 2.0 * 0.1 * 3 = 0.6 tokens
        assert bucket.available > 0.1

    def test_refill_does_not_exceed_capacity(self):
        bucket = TokenBucket(capacity=10, refill_rate=100.0, refill_interval=0.1)
        time.sleep(0.3)
        assert bucket.available == pytest.approx(10.0)

    def test_available_is_read_only(self):
        bucket = TokenBucket(capacity=10, refill_rate=1.0)
        before = bucket.available
        after = bucket.available
        assert before == pytest.approx(after)

    def test_multiple_consumes(self):
        bucket = TokenBucket(capacity=20, refill_rate=0.0)
        results = [bucket.consume(5) for _ in range(5)]
        assert results == [True, True, True, True, False]

    def test_zero_capacity(self):
        bucket = TokenBucket(capacity=0, refill_rate=0.0)
        assert not bucket.consume(1)


class TestValkeyRateLimiter:
    async def test_uses_atomic_eval_and_shared_key(self):
        raw = _FakeRawValkey(result=1)
        limiter = ValkeyRateLimiter(
            valkey_client=_FakeValkey(raw),
            capacity=3,
            window_seconds=60,
        )

        assert await limiter.is_allowed("workspace-1")
        assert raw.calls[0][1] == 1
        assert raw.calls[0][2] == "test:arclayer:ratelimit:workspace-1"

    async def test_returns_false_when_atomic_script_rejects_request(self):
        raw = _FakeRawValkey(result=0)
        limiter = ValkeyRateLimiter(valkey_client=_FakeValkey(raw), capacity=1, window_seconds=60)

        assert not await limiter.is_allowed("workspace-1")

    async def test_surfaces_backend_failure_without_local_fallback(self):
        raw = _FakeRawValkey(error=ConnectionError("offline"))
        limiter = ValkeyRateLimiter(valkey_client=_FakeValkey(raw), capacity=1, window_seconds=60)

        with pytest.raises(RateLimitBackendUnavailable):
            await limiter.is_allowed("workspace-1")
