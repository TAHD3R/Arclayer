from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.llm.policy import RuntimeAiPolicy
from src.llm.provider import BaseLLMProvider
from src.llm.runtime import (
    LLMRequestContext,
    LLMRuntime,
    compute_cost_micros,
    estimate_cost_micros,
)
from src.modules.projects.design_systems.concept_provider import _provider_params

_OBSERVED_STYLE_GUIDE_PROMPT_TOKENS = 3941
_OBSERVED_STYLE_GUIDE_COMPLETION_TOKENS = 4096
_OBSERVED_STYLE_GUIDE_COST_MICROS = 5278


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
    ) -> tuple[str, int, int, int, dict[str, Any], tuple[int, int] | None]:
        return "virtual-key", 4, 100, 64, {}, None


def _runtime(chunks: list[dict[str, Any]]) -> LLMRuntime:
    return _TestRuntime(provider=_StreamingProvider(chunks))


def _terminal_chunk() -> dict[str, Any]:
    return {
        "choices": [{"delta": {"content": "done"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 2},
    }


def test_deepseek_cost_matches_litellm_model_group_pricing() -> None:
    actual = compute_cost_micros(
        "deepseek-v4-pro",
        _OBSERVED_STYLE_GUIDE_PROMPT_TOKENS,
        _OBSERVED_STYLE_GUIDE_COMPLETION_TOKENS,
    )
    estimated = estimate_cost_micros(
        "deepseek-v4-pro",
        _OBSERVED_STYLE_GUIDE_PROMPT_TOKENS,
        _OBSERVED_STYLE_GUIDE_COMPLETION_TOKENS,
    )

    assert actual == _OBSERVED_STYLE_GUIDE_COST_MICROS
    assert estimated == _OBSERVED_STYLE_GUIDE_COST_MICROS


@pytest.mark.asyncio
async def test_deepseek_tool_request_reservation_covers_observed_style_guide_usage() -> None:
    runtime = LLMRuntime(provider=_StreamingProvider([]))
    messages = [{"role": "user", "content": "Create one typed Style Guide candidate."}]

    with (
        patch(
            "src.llm.keys.resolve_litellm_key",
            new=AsyncMock(return_value=SimpleNamespace(virtual_key="virtual-key", grant_id=None)),
        ),
        patch("src.llm.policy.resolve_model_policy", new=AsyncMock(return_value=SimpleNamespace())),
        patch(
            "src.llm.policy.resolve_runtime_policy",
            new=AsyncMock(
                return_value=RuntimeAiPolicy(
                    revision_id=None,
                    sequence=None,
                    allowed_models=(),
                    max_tokens_per_request=0,
                    max_cost_micros_per_request=0,
                    max_concurrent_runs=None,
                    external_data_egress_allowed=True,
                    tool_allowlist=None,
                    approval_required_effect_classes=frozenset(),
                    retry_limit=None,
                )
            ),
        ),
        patch("src.llm.policy.enforce_model_policy"),
        patch("src.llm.policy.resolve_provider_retention_params", return_value={}),
        patch(
            "src.modules.system.ai_providers.configuration.resolve_active_system_model",
            new=AsyncMock(return_value=None),
        ),
    ):
        (
            _virtual_key,
            prompt_token_upper_bound,
            estimated_cost,
            effective_max_tokens,
            _merged_params,
            _pricing,
        ) = await runtime._resolve_call_context(
            messages,
            context=LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents"),
            model="deepseek-v4-pro",
            max_tokens=_OBSERVED_STYLE_GUIDE_COMPLETION_TOKENS,
            provider_params=_provider_params(),
        )

    observed_actual_cost = compute_cost_micros(
        "deepseek-v4-pro",
        _OBSERVED_STYLE_GUIDE_PROMPT_TOKENS,
        _OBSERVED_STYLE_GUIDE_COMPLETION_TOKENS,
    )
    assert effective_max_tokens == _OBSERVED_STYLE_GUIDE_COMPLETION_TOKENS
    assert prompt_token_upper_bound >= _OBSERVED_STYLE_GUIDE_PROMPT_TOKENS
    assert estimated_cost >= observed_actual_cost


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
            context=LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents"),
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
                context=LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents"),
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
                context=LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents"),
                model="gpt-4o-mini",
                budget_id=uuid4(),
            )
        ]

    assert chunks == []
    commit_mock.assert_not_awaited()
    release_mock.assert_awaited_once_with(reservation_id=reservation.id)
