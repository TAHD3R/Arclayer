from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.llm.provider import BaseLLMProvider
from src.llm.runtime import LLMRequestContext, LLMRuntime, compute_cost_micros


class _StreamingProvider(BaseLLMProvider):
    def __init__(self, chunks: list[dict[str, Any]]) -> None:
        self._chunks = chunks

    async def health(self) -> dict[str, Any]:
        return {"status": "healthy"}

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        raise AssertionError("non-streaming chat is not used by this test")

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[dict[str, Any]]:
        for chunk in self._chunks:
            yield chunk


class _TestRuntime(LLMRuntime):
    async def _resolve_call_context(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str,
        max_tokens: int | None,
        provider_params: dict[str, Any] | None,
    ) -> tuple[str, int, int, int, dict[str, Any]]:
        return "virtual-key", 4, 100, 64, {}


def _runtime(chunks: list[dict[str, Any]]) -> LLMRuntime:
    return _TestRuntime(provider=_StreamingProvider(chunks))


def _terminal_chunk() -> dict[str, Any]:
    return {
        "choices": [{"delta": {"content": "done"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 2},
    }


@pytest.mark.asyncio
async def test_stream_commits_before_exposing_terminal_success() -> None:
    runtime = _runtime([_terminal_chunk()])
    reservation = SimpleNamespace(id=uuid4())
    order: list[str] = []

    async def record_commit(**kwargs: Any) -> None:
        order.append("commit")

    with (
        patch("src.llm.budget.reserve", new=AsyncMock(return_value=reservation)),
        patch("src.llm.budget.commit", new=AsyncMock(side_effect=record_commit)) as commit_mock,
        patch("src.llm.budget.release", new=AsyncMock()) as release_mock,
    ):
        async for _chunk in runtime.chat_stream(
            [{"role": "user", "content": "hello"}],
            context=LLMRequestContext(workspace_id=uuid4()),
            model="gpt-4o-mini",
            budget_id=uuid4(),
        ):
            order.append("yield")

    assert order == ["commit", "yield"]
    commit_mock.assert_awaited_once_with(
        reservation_id=reservation.id,
        actual_cost_micros=compute_cost_micros("gpt-4o-mini", 10, 2),
    )
    release_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_closing_stream_after_terminal_chunk_does_not_release_committed_hold() -> None:
    runtime = _runtime([_terminal_chunk()])
    reservation = SimpleNamespace(id=uuid4())

    with (
        patch("src.llm.budget.reserve", new=AsyncMock(return_value=reservation)),
        patch("src.llm.budget.commit", new=AsyncMock()) as commit_mock,
        patch("src.llm.budget.release", new=AsyncMock()) as release_mock,
    ):
        stream = cast(
            AsyncGenerator[dict[str, Any], None],
            runtime.chat_stream(
                [{"role": "user", "content": "hello"}],
                context=LLMRequestContext(workspace_id=uuid4()),
                model="gpt-4o-mini",
                budget_id=uuid4(),
            ),
        )
        await anext(stream)
        await stream.aclose()

    commit_mock.assert_awaited_once()
    release_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_empty_provider_stream_releases_reservation() -> None:
    runtime = _runtime([])
    reservation = SimpleNamespace(id=uuid4())

    with (
        patch("src.llm.budget.reserve", new=AsyncMock(return_value=reservation)),
        patch("src.llm.budget.commit", new=AsyncMock()) as commit_mock,
        patch("src.llm.budget.release", new=AsyncMock()) as release_mock,
    ):
        chunks = [
            chunk
            async for chunk in runtime.chat_stream(
                [{"role": "user", "content": "hello"}],
                context=LLMRequestContext(workspace_id=uuid4()),
                model="gpt-4o-mini",
                budget_id=uuid4(),
            )
        ]

    assert chunks == []
    commit_mock.assert_not_awaited()
    release_mock.assert_awaited_once_with(reservation_id=reservation.id)
