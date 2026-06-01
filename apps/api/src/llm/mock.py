"""Mock LLM provider for local development and testing.

Provides a fake LiteLLM-compatible HTTP API that returns deterministic
responses without calling any external LLM provider.

Usage:
    from src.llm.mock import MockLLMProvider

    mock = MockLLMProvider()
    response = await mock.chat([{"role": "user", "content": "Hello"}])
"""

from __future__ import annotations

import time
import uuid
from typing import Any


class MockLLMProvider:
    """Fake LLM provider that returns canned responses.

    Used in development when no real provider API keys are configured,
    and in tests to avoid external network calls.

    Simulates the LiteLLM /chat/completions response contract.
    """

    def __init__(self, *, latency_ms: int = 0, fail_every: int = 0) -> None:
        self._latency_ms = latency_ms
        self._fail_every = fail_every
        self._call_count = 0
        self._history: list[dict[str, Any]] = []

    @property
    def call_count(self) -> int:
        return self._call_count

    @property
    def history(self) -> list[dict[str, Any]]:
        return list(self._history)

    async def health(self) -> dict[str, Any]:
        return {"status": "healthy", "provider": "mock"}

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "mock",
        temperature: float | None = None,
        max_tokens: int | None = None,
        stream: bool = False,
    ) -> dict[str, Any]:
        """Simulate a chat completion call.

        Returns a canned response that echoes the last user message.
        If fail_every is set, raises an exception every N calls (for fault injection).
        """
        self._call_count += 1

        if self._latency_ms > 0:
            time.sleep(self._latency_ms / 1000)

        if self._fail_every > 0 and self._call_count % self._fail_every == 0:
            raise MockLLMError(
                status_code=503,
                message="Mock LLM simulated failure",
                error_type="service_unavailable",
            )

        last_user = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"),
            "",
        )

        prompt_tokens = sum(len(m.get("content", "")) // 4 for m in messages)
        completion_tokens = len(last_user) // 3

        response: dict[str, Any] = {
            "id": f"mock-{uuid.uuid4().hex[:12]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": f"[mock response] Received: {last_user}",
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": max(prompt_tokens, 1),
                "completion_tokens": max(completion_tokens, 1),
                "total_tokens": max(prompt_tokens + completion_tokens, 2),
            },
        }
        self._history.append({"request": messages, "response": response})
        return response

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str = "mock",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ):
        """Simulate a streaming chat completion.

        Yields SSE-style chunks that mirror LiteLLM's streaming response format.
        """
        self._call_count += 1

        if self._fail_every > 0 and self._call_count % self._fail_every == 0:
            raise MockLLMError(
                status_code=503,
                message="Mock LLM simulated failure",
                error_type="service_unavailable",
            )

        last_user = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        response_text = f"[mock response] Received: {last_user}"
        chunk_id = f"mock-{uuid.uuid4().hex[:12]}"
        created = int(time.time())

        words = response_text.split(" ")
        for i, word in enumerate(words):
            content = word if i == 0 else f" {word}"
            yield {
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": content},
                        "finish_reason": "stop" if i == len(words) - 1 else None,
                    }
                ],
            }

    def reset(self) -> None:
        self._call_count = 0
        self._history.clear()


class MockLLMError(Exception):
    """Simulated LLM provider error for fault injection testing."""

    def __init__(self, *, status_code: int, message: str, error_type: str) -> None:
        self.status_code = status_code
        self.message = message
        self.error_type = error_type
        super().__init__(message)
