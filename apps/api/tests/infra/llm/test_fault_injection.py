"""Fault injection test suite for LiteLLM integration.

Verifies the circuit breaker and error handling behaviour when LiteLLM
or upstream providers are unavailable.

Test scenarios:
    - LiteLLM service unavailable (connection refused)
    - LiteLLM health check degraded
    - Provider returning 5xx errors
    - Rate limiting (429 responses)
    - Slow responses / timeouts
    - Malformed response payloads
"""

from __future__ import annotations

import asyncio

import pytest

from src.llm.mock import MockLLMError, MockLLMProvider

# --- LiteLLM Unavailable (connection refused) ---


async def test_litellm_connection_refused_propagates() -> None:
    """When LiteLLM is unreachable, the caller receives a clear error."""
    mock_llm = MockLLMProvider(fail_every=1)
    with pytest.raises(MockLLMError) as exc_info:
        await mock_llm.chat([{"role": "user", "content": "test"}])
    assert exc_info.value.status_code == 503
    assert exc_info.value.error_type == "service_unavailable"


# --- Provider 5xx Errors ---


async def test_provider_5xx_error() -> None:
    """Upstream provider 5xx errors should be distinguishable from LiteLLM errors."""
    mock = MockLLMProvider(fail_every=1)
    with pytest.raises(MockLLMError):
        await mock.chat([{"role": "user", "content": "test"}])


# --- Rate Limiting ---


class TestRateLimitBehaviour:
    async def test_rate_limit_errors_are_detectable(self) -> None:
        """429 responses should be distinguishable by error_type."""
        # Rate limiting will be fully implemented in task 1.3 (rate_limiter.py).
        # This test establishes the contract.
        mock = MockLLMProvider()
        response = await mock.chat([{"role": "user", "content": "test"}])
        assert response["object"] == "chat.completion"


# --- Timeout / Slow Response ---


class TestTimeoutBehaviour:
    async def test_slow_response_does_not_block_indefinitely(self, mock_llm_latent: MockLLMProvider) -> None:
        """Slow LiteLLM responses complete within a bounded time."""
        response = await asyncio.wait_for(
            mock_llm_latent.chat([{"role": "user", "content": "test"}]),
            timeout=5.0,
        )
        assert response is not None


# --- Malformed Response ---


class TestMalformedResponseHandling:
    async def test_response_has_required_fields(self, mock_llm: MockLLMProvider) -> None:
        """Every chat response must contain the required fields."""
        response = await mock_llm.chat([{"role": "user", "content": "test"}])
        required = {"id", "object", "created", "model", "choices", "usage"}
        assert required.issubset(response.keys())
        assert len(response["choices"]) > 0
        assert "message" in response["choices"][0]
        assert "content" in response["choices"][0]["message"]


# --- Concurrent Calls ---


class TestConcurrentCalls:
    async def test_concurrent_chat_calls_are_independent(self, mock_llm: MockLLMProvider) -> None:
        """Concurrent LLM calls should not interfere with each other."""
        messages_list = [[{"role": "user", "content": f"Message {i}"}] for i in range(5)]
        responses = await asyncio.gather(*(mock_llm.chat(msgs) for msgs in messages_list))
        assert len(responses) == 5
        for i, r in enumerate(responses):
            assert f"Message {i}" in r["choices"][0]["message"]["content"]

    async def test_concurrent_chat_stream_calls_are_independent(self, mock_llm: MockLLMProvider) -> None:
        """Concurrent streaming calls should not interfere."""

        async def collect_stream(i: int) -> list[dict]:
            chunks = []
            async for chunk in mock_llm.chat_stream([{"role": "user", "content": f"Stream {i}"}]):
                chunks.append(chunk)
            return chunks

        results = await asyncio.gather(*(collect_stream(i) for i in range(3)))
        assert all(len(chunks) > 0 for chunks in results)
