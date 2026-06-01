"""Tests for LiteLLM proxy health check endpoint.

These tests verify the health check contract between Arclayer and the
LiteLLM sidecar proxy.

For integration tests (RUN_INTEGRATION_TESTS=1), these hit the real
LiteLLM container. For unit tests, they verify the mock.
"""

from __future__ import annotations

import pytest

from src.llm.mock import MockLLMError, MockLLMProvider


class TestMockLLMHealth:
    async def test_health_returns_healthy(self, mock_llm: MockLLMProvider) -> None:
        result = await mock_llm.health()
        assert result["status"] == "healthy"

    async def test_health_is_idempotent(self, mock_llm: MockLLMProvider) -> None:
        r1 = await mock_llm.health()
        r2 = await mock_llm.health()
        assert r1 == r2


class TestMockLLMChat:
    async def test_chat_returns_canned_response(self, mock_llm: MockLLMProvider) -> None:
        response = await mock_llm.chat([{"role": "user", "content": "Hello"}])
        assert response["object"] == "chat.completion"
        assert "mock response" in response["choices"][0]["message"]["content"]
        assert "Hello" in response["choices"][0]["message"]["content"]

    async def test_chat_includes_usage(self, mock_llm: MockLLMProvider) -> None:
        response = await mock_llm.chat([{"role": "user", "content": "Hello world"}])
        usage = response["usage"]
        assert usage["prompt_tokens"] > 0
        assert usage["completion_tokens"] > 0
        assert usage["total_tokens"] == usage["prompt_tokens"] + usage["completion_tokens"]

    async def test_chat_increments_call_count(self, mock_llm: MockLLMProvider) -> None:
        assert mock_llm.call_count == 0
        await mock_llm.chat([{"role": "user", "content": "A"}])
        assert mock_llm.call_count == 1
        await mock_llm.chat([{"role": "user", "content": "B"}])
        assert mock_llm.call_count == 2

    async def test_chat_records_history(self, mock_llm: MockLLMProvider) -> None:
        await mock_llm.chat([{"role": "user", "content": "First"}])
        await mock_llm.chat([{"role": "user", "content": "Second"}])
        assert len(mock_llm.history) == 2

    async def test_chat_with_latency(self, mock_llm_latent: MockLLMProvider) -> None:
        response = await mock_llm_latent.chat([{"role": "user", "content": "Test"}])
        assert response["object"] == "chat.completion"


class TestMockLLMChatStream:
    async def test_chat_stream_yields_chunks(self, mock_llm: MockLLMProvider) -> None:
        chunks = []
        async for chunk in mock_llm.chat_stream([{"role": "user", "content": "Stream test"}]):
            chunks.append(chunk)
        assert len(chunks) > 0
        all_content = "".join(c["choices"][0]["delta"].get("content", "") for c in chunks)
        assert "mock response" in all_content
        assert "Stream test" in all_content

    async def test_chat_stream_last_chunk_has_finish_reason(self, mock_llm: MockLLMProvider) -> None:
        chunks = []
        async for chunk in mock_llm.chat_stream([{"role": "user", "content": "X"}]):
            chunks.append(chunk)
        assert chunks[-1]["choices"][0]["finish_reason"] == "stop"


class TestMockLLMReset:
    async def test_reset_clears_state(self, mock_llm: MockLLMProvider) -> None:
        await mock_llm.chat([{"role": "user", "content": "A"}])
        mock_llm.reset()
        assert mock_llm.call_count == 0
        assert len(mock_llm.history) == 0


class TestMockLLMFaultInjection:
    async def test_fails_every_n_calls(self, mock_llm_faulty: MockLLMProvider) -> None:
        # Calls 1, 2 should succeed
        await mock_llm_faulty.chat([{"role": "user", "content": "A"}])
        await mock_llm_faulty.chat([{"role": "user", "content": "B"}])
        assert mock_llm_faulty.call_count == 2

        # Call 3 should fail
        with pytest.raises(MockLLMError) as exc_info:
            await mock_llm_faulty.chat([{"role": "user", "content": "C"}])
        assert exc_info.value.status_code == 503
        assert exc_info.value.error_type == "service_unavailable"

        # Call 4 should succeed again
        await mock_llm_faulty.chat([{"role": "user", "content": "D"}])
        assert mock_llm_faulty.call_count == 4

    async def test_faulty_stream_fails_every_n_calls(self, mock_llm_faulty: MockLLMProvider) -> None:
        async for _ in mock_llm_faulty.chat_stream([{"role": "user", "content": "A"}]):
            pass
        async for _ in mock_llm_faulty.chat_stream([{"role": "user", "content": "B"}]):
            pass
        with pytest.raises(MockLLMError):
            async for _ in mock_llm_faulty.chat_stream([{"role": "user", "content": "C"}]):
                pass
