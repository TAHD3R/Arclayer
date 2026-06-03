"""LLMRuntime — single entry point for all LLM calls.

R3 audit requirements:
    - Phase 1 endpoint is pure LLM chat, not Agent.
    - Session/Cancel/Recovery deferred to Phase 3A.
    - SSE event set narrowed to chat-related events.

Call flow:
    1. Key resolution (Workspace-First) — deferred to task 1.6
    2. Model policy validation — deferred to task 1.4
    3. Budget pre-check & atomic reservation
    4. LiteLLM proxy call
    5. Budget reconciliation (commit/release)
    6. Audit log — deferred to task 1.5
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID

from src.llm.provider import BaseLLMProvider

# Pricing in microdollars per 1k tokens (µ$/1K tokens).
# Converted from $/1M tokens: $X/1M tokens = X µ$/1K tokens.
_PRICING_MICROS_PER_1K: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 150.0, "output": 600.0},
    "gpt-4o": {"input": 2500.0, "output": 10000.0},
    "claude-sonnet-4-6": {"input": 3000.0, "output": 15000.0},
}


def detect_provider(model: str) -> str:
    """Detect the provider name from a model identifier.

    Used to route data retention policies and audit log entries.
    Returns ``"openai"``, ``"anthropic"``, or ``"unknown"`` for unrecognized models.
    """
    if model.startswith("gpt") or model.startswith("o1") or model.startswith("o3"):
        return "openai"
    if model.startswith("claude"):
        return "anthropic"
    return model.split("/")[0] if "/" in model else "unknown"


def compute_cost_micros(model: str, prompt_tokens: int, completion_tokens: int) -> int:
    """Compute actual cost in microdollars from token counts.

    Falls back to estimated 1 µ$/token for unknown models.
    """
    pricing = _PRICING_MICROS_PER_1K.get(model)
    if pricing is None:
        return prompt_tokens + completion_tokens  # rough fallback at 1 µ$/token

    cost = (prompt_tokens * pricing["input"] + completion_tokens * pricing["output"]) / 1000.0
    return max(int(round(cost)), 1)


@dataclass
class LLMRequestContext:
    """Context bundled with every LLM call — no caller should pass raw keys."""

    workspace_id: UUID
    user_id: UUID | None = None
    correlation_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    source: Literal["agent", "event", "api"] = "api"
    grant_id: UUID | None = None


@dataclass
class ChatResult:
    """Result from a chat completion call."""

    completion_id: str
    model: str
    content: str
    prompt_tokens: int
    completion_tokens: int
    cost_micros: int
    finish_reason: str


class LLMRuntimeError(Exception):
    """Base error for LLMRuntime failures."""

    def __init__(self, *, code: str, message: str, status_code: int = 500) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class LLMRuntime:
    """Single entry point for all LLM calls.

    Phase 1 scope: pure chat completion. No agent tool-calling loop.
    Key resolution and model policy are deferred to tasks 1.4/1.6.
    Budget pre-check + reconciliation is active from day one.
    """

    def __init__(
        self,
        *,
        litellm_base_url: str = "http://localhost:4000",
        litellm_master_key: str | None = None,
        litellm_timeout_seconds: float = 120.0,
        default_max_tokens: int = 4096,
        default_data_retention_enabled: bool = False,
        provider: BaseLLMProvider | None = None,
    ) -> None:
        self._litellm_base_url = litellm_base_url
        self._litellm_master_key = litellm_master_key
        self._default_max_tokens = default_max_tokens
        self._default_data_retention_enabled = default_data_retention_enabled
        if provider is not None:
            self._provider = provider
        else:
            from src.llm.litellm_client import LiteLLMClient

            self._provider = LiteLLMClient(
                base_url=litellm_base_url,
                virtual_key=litellm_master_key,
                timeout_seconds=litellm_timeout_seconds,
            )

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str = "gpt-4o-mini",
        temperature: float | None = None,
        max_tokens: int | None = None,
        budget_id: UUID | None = None,
        provider_params: dict[str, Any] | None = None,
    ) -> ChatResult:
        """Perform a chat completion with budget control.

        Phase 1: pure LLM call, no Agent session management.
        Budget is pre-checked and reconciled atomically when budget_id is provided.
        When ``provider_params`` is supplied, it is merged into the provider request
        (e.g. ``{"store": False}`` for OpenAI data retention opt-out).
        """
        # Estimate cost for budget reservation.
        from src.llm.budget import commit as budget_commit
        from src.llm.budget import release as budget_release
        from src.llm.budget import reserve as budget_reserve
        from src.llm.token_counter import estimate_tokens

        estimated_tokens = estimate_tokens(messages, model=model)

        # Reserve budget if budget_id is provided.
        reservation = None
        if budget_id is not None:
            reservation = await budget_reserve(
                budget_id=budget_id,
                request_id=uuid.uuid4(),
                estimated_cost_micros=estimated_tokens,  # 1 µ$/token fallback estimate
            )

        try:
            data = await self._provider.chat(
                messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                **(provider_params or {}),
            )
        except Exception as exc:
            # Release budget reservation on failure.
            if reservation is not None:
                await budget_release(reservation_id=reservation.id)
            raise

        choice = data["choices"][0]
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)

        actual_cost = compute_cost_micros(model, prompt_tokens, completion_tokens)

        # Commit budget on success.
        if reservation is not None:
            await budget_commit(
                reservation_id=reservation.id,
                actual_cost_micros=actual_cost,
            )

        return ChatResult(
            completion_id=data["id"],
            model=data.get("model", model),
            content=choice["message"]["content"],
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_micros=actual_cost,
            finish_reason=choice.get("finish_reason", "stop"),
        )

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str = "gpt-4o-mini",
        temperature: float | None = None,
        max_tokens: int | None = None,
        budget_id: UUID | None = None,
        provider_params: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Stream a chat completion with budget control.

        Yields raw provider chunks. Budget is reserved before streaming
        and committed/released based on outcome.
        """
        from src.llm.budget import commit as budget_commit
        from src.llm.budget import release as budget_release
        from src.llm.budget import reserve as budget_reserve
        from src.llm.token_counter import estimate_tokens

        estimated_tokens = estimate_tokens(messages, model=model)

        reservation = None
        if budget_id is not None:
            reservation = await budget_reserve(
                budget_id=budget_id,
                request_id=uuid.uuid4(),
                estimated_cost_micros=estimated_tokens,
            )

        try:
            last_chunk = None
            async for chunk in self._provider.chat_stream(
                messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                **(provider_params or {}),
            ):
                last_chunk = chunk
                yield chunk

            # Commit budget after stream completes successfully.
            if reservation is not None and last_chunk is not None:
                usage = last_chunk.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                actual_cost = compute_cost_micros(model, prompt_tokens, completion_tokens)
                await budget_commit(
                    reservation_id=reservation.id,
                    actual_cost_micros=actual_cost,
                )
        except BaseException:
            if reservation is not None:
                await budget_release(reservation_id=reservation.id)
            raise
