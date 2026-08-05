"""LLMRuntime — single entry point for all LLM calls.

R3 audit requirements:
    - Phase 1 endpoint is pure LLM chat, not Agent.
    - Session/Cancel/Recovery deferred to Phase 3A.
    - SSE event set narrowed to chat-related events.

Call flow:
    1. Key resolution (Workspace-First)
    2. Model policy validation
    3. Budget pre-check & atomic reservation
    4. LiteLLM proxy call
    5. Budget reconciliation (commit/release)
    6. Audit log — deferred to task 1.5
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from enum import StrEnum
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from src.common.schemas import BaseSchema
from src.llm.provider import BaseLLMProvider

_API_SRC_DIR = Path(__file__).resolve().parent  # apps/api/src/llm
_REPO_ROOT = _API_SRC_DIR.parents[3]  # repo root


def _resolve_key_path(raw: str) -> Path:
    """Resolve a key file path relative to the repo root."""
    path = Path(raw)
    if path.is_absolute():
        return path
    return (_REPO_ROOT / path).resolve()


# Pricing in microdollars per 1k tokens (µ$/1K tokens).
# Converted from $/1M tokens: $X/1M tokens = X µ$/1K tokens.
_PRICING_MICROS_PER_1K: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 150.0, "output": 600.0},
    "gpt-4o": {"input": 2500.0, "output": 10000.0},
    "claude-sonnet-4-6": {"input": 3000.0, "output": 15000.0},
    "deepseek-v4-pro": {"input": 435.0, "output": 870.0},
}
ModelPricing = tuple[int, int]


def detect_provider(model: str) -> str:
    """Detect the provider name from a model identifier.

    Used to route data retention policies and audit log entries.
    Returns a provider key used for LLM key resolution and policy metadata.
    """
    if model.startswith("gpt") or model.startswith("o1") or model.startswith("o3"):
        return "openai"
    if model.startswith("claude"):
        return "anthropic"
    if model.startswith("deepseek"):
        return "deepseek"
    return model.split("/")[0] if "/" in model else "unknown"


def compute_cost_micros(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    *,
    pricing: ModelPricing | None = None,
) -> int:
    """Compute actual cost in microdollars from token counts.

    Falls back to estimated 1 µ$/token for unknown models.
    """
    if pricing is not None:
        input_cost, output_cost = pricing
        configured_cost = (prompt_tokens * input_cost + completion_tokens * output_cost) / 1_000_000
        return max(int(round(configured_cost)), 1) if configured_cost > 0 else 0
    static_pricing = _PRICING_MICROS_PER_1K.get(model)
    if static_pricing is None:
        return prompt_tokens + completion_tokens  # rough fallback at 1 µ$/token

    cost = (prompt_tokens * static_pricing["input"] + completion_tokens * static_pricing["output"]) / 1000.0
    return max(int(round(cost)), 1)


def estimate_cost_micros(
    model: str,
    prompt_tokens: int,
    max_tokens: int,
    *,
    pricing: ModelPricing | None = None,
) -> int:
    """Pre-call cost estimate in microdollars using model pricing.

    Falls back to 1 µ$/token for unknown models.
    """
    if pricing is not None:
        input_cost, output_cost = pricing
        configured_cost = (prompt_tokens * input_cost + max_tokens * output_cost) / 1_000_000
        return max(int(round(configured_cost)), 1) if configured_cost > 0 else 0
    static_pricing = _PRICING_MICROS_PER_1K.get(model)
    if static_pricing is None:
        return prompt_tokens + max_tokens  # rough fallback at 1 µ$/token

    cost = (prompt_tokens * static_pricing["input"] + max_tokens * static_pricing["output"]) / 1000.0
    return max(int(round(cost)), 1)


class LLMCapability(StrEnum):
    AGENTS = "ai.agents"
    WORKSPACE_ACTIONS = "ai.workspace_actions"
    DESIGN_SYSTEMS = "ai.design_systems"
    BUILDER = "ai.builder"
    CONTENT = "ai.content"


class LLMRequestContext(BaseSchema):
    """Context bundled with every LLM call — no caller should pass raw keys."""

    workspace_id: UUID
    capability_key: str = Field(min_length=1, max_length=160)
    project_id: UUID | None = None
    agent_run_id: UUID | None = None
    user_id: UUID | None = None
    correlation_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    source: Literal["agent", "event", "api"] = "api"
    grant_id: UUID | None = None


class ChatResult(BaseSchema):
    """Result from a chat completion call."""

    completion_id: str
    model: str
    content: str
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
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
    Key resolution and model policy are enforced before every call.
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
        master_key_path: str | None = None,
        allow_platform_key: bool = False,
        provider: BaseLLMProvider | None = None,
    ) -> None:
        self._litellm_base_url = litellm_base_url
        self._litellm_master_key = litellm_master_key
        self._default_max_tokens = default_max_tokens
        self._default_data_retention_enabled = default_data_retention_enabled
        self._master_key_path = _resolve_key_path(master_key_path) if master_key_path else None
        self._allow_platform_key = allow_platform_key
        if provider is not None:
            self._provider = provider
        else:
            from src.llm.litellm_client import LiteLLMClient

            self._provider = LiteLLMClient(
                base_url=litellm_base_url,
                timeout_seconds=litellm_timeout_seconds,
            )

    async def _resolve_call_context(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str,
        max_tokens: int | None,
        provider_params: dict[str, Any] | None,
    ) -> tuple[str, int, int, int, dict[str, Any], ModelPricing | None]:
        """Resolve key + policy before a provider call.

        Returns (virtual_key, prompt_tokens, estimated_cost_micros, effective_max_tokens, merged_params).
        """
        from src.llm.keys import resolve_litellm_key
        from src.llm.policy import enforce_model_policy, resolve_model_policy, resolve_provider_retention_params
        from src.llm.token_counter import estimate_prompt_tokens_upper_bound
        from src.modules.system.ai_providers.configuration import resolve_active_system_model

        configured_model = await resolve_active_system_model(model)
        provider_name = configured_model.provider if configured_model is not None else detect_provider(model)
        pricing = (
            (
                configured_model.billing.input_cost_micros_per_million_tokens,
                configured_model.billing.output_cost_micros_per_million_tokens,
            )
            if configured_model is not None and configured_model.billing is not None
            else None
        )
        effective_max_tokens = max_tokens if max_tokens is not None else self._default_max_tokens

        resolved_key = await resolve_litellm_key(
            workspace_id=context.workspace_id,
            user_id=context.user_id,
            provider=provider_name,
            master_key_path=self._master_key_path,
            allow_platform_key=self._allow_platform_key,
        )
        context.grant_id = resolved_key.grant_id

        policy = await resolve_model_policy(
            workspace_id=context.workspace_id,
            user_id=context.user_id,
            global_data_retention_enabled=self._default_data_retention_enabled,
        )
        retention_params = resolve_provider_retention_params(policy, provider_name)
        merged_params = {**(provider_params or {}), **retention_params}
        prompt_tokens = estimate_prompt_tokens_upper_bound(
            messages,
            provider_params=merged_params,
        )
        estimated_cost = estimate_cost_micros(
            model,
            prompt_tokens,
            effective_max_tokens,
            pricing=pricing,
        )
        enforce_model_policy(
            model=model,
            max_tokens=effective_max_tokens,
            estimated_cost_micros=estimated_cost,
            policy=policy,
            provider=provider_name,
        )

        return (
            resolved_key.virtual_key,
            prompt_tokens,
            estimated_cost,
            effective_max_tokens,
            merged_params,
            pricing,
        )

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        budget_id: UUID | None = None,
        provider_params: dict[str, Any] | None = None,
    ) -> ChatResult:
        """Perform a chat completion with key resolution, policy enforcement, and budget control."""
        from src.llm.budget import commit as budget_commit
        from src.llm.budget import release as budget_release
        from src.llm.budget import reserve as budget_reserve

        (
            virtual_key,
            prompt_tokens,
            estimated_cost,
            effective_max_tokens,
            merged_params,
            pricing,
        ) = await self._resolve_call_context(
            messages,
            context=context,
            model=model,
            max_tokens=max_tokens,
            provider_params=provider_params,
        )

        reservation = None
        if budget_id is not None:
            reservation = await budget_reserve(
                budget_id=budget_id,
                request_id=uuid.uuid4(),
                estimated_cost_micros=estimated_cost,
                workspace_id=context.workspace_id,
                agent_run_id=context.agent_run_id,
                actor_user_id=context.user_id,
                project_id=context.project_id,
                capability_key=context.capability_key,
            )

        try:
            data = await self._provider.chat(
                messages,
                model=model,
                temperature=temperature,
                max_tokens=effective_max_tokens,
                virtual_key=virtual_key,
                **merged_params,
            )
        except BaseException:
            if reservation is not None:
                await budget_release(reservation_id=reservation.id)
            raise

        choice = data["choices"][0]
        message = choice["message"]
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)

        actual_cost = compute_cost_micros(
            model,
            prompt_tokens,
            completion_tokens,
            pricing=pricing,
        )

        if reservation is not None:
            await budget_commit(
                reservation_id=reservation.id,
                actual_cost_micros=actual_cost,
            )

        return ChatResult(
            completion_id=data["id"],
            model=data.get("model", model),
            content=message.get("content") or "",
            tool_calls=message.get("tool_calls") or [],
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
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        budget_id: UUID | None = None,
        provider_params: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Stream a chat completion with key resolution, policy enforcement, and budget control."""
        from src.llm.budget import commit as budget_commit
        from src.llm.budget import release as budget_release
        from src.llm.budget import reserve as budget_reserve

        (
            virtual_key,
            prompt_tokens,
            estimated_cost,
            effective_max_tokens,
            merged_params,
            pricing,
        ) = await self._resolve_call_context(
            messages,
            context=context,
            model=model,
            max_tokens=max_tokens,
            provider_params=provider_params,
        )

        reservation = None
        if budget_id is not None:
            reservation = await budget_reserve(
                budget_id=budget_id,
                request_id=uuid.uuid4(),
                estimated_cost_micros=estimated_cost,
                workspace_id=context.workspace_id,
                agent_run_id=context.agent_run_id,
                actor_user_id=context.user_id,
                project_id=context.project_id,
                capability_key=context.capability_key,
            )

        try:
            last_chunk = None
            reservation_settled = False
            async for chunk in self._provider.chat_stream(
                messages,
                model=model,
                temperature=temperature,
                max_tokens=effective_max_tokens,
                virtual_key=virtual_key,
                **merged_params,
            ):
                last_chunk = chunk
                choices = chunk.get("choices", [])
                is_terminal = any(choice.get("finish_reason") for choice in choices)
                if reservation is not None and not reservation_settled and is_terminal:
                    usage = chunk.get("usage", {})
                    prompt_tokens = usage.get("prompt_tokens", 0)
                    completion_tokens = usage.get("completion_tokens", 0)
                    actual_cost = compute_cost_micros(
                        model,
                        prompt_tokens,
                        completion_tokens,
                        pricing=pricing,
                    )
                    await budget_commit(
                        reservation_id=reservation.id,
                        actual_cost_micros=actual_cost,
                    )
                    reservation_settled = True
                yield chunk

            if reservation is not None and not reservation_settled and last_chunk is not None:
                usage = last_chunk.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                actual_cost = compute_cost_micros(
                    model,
                    prompt_tokens,
                    completion_tokens,
                    pricing=pricing,
                )
                await budget_commit(
                    reservation_id=reservation.id,
                    actual_cost_micros=actual_cost,
                )
                reservation_settled = True
            elif reservation is not None and last_chunk is None:
                await budget_release(reservation_id=reservation.id)
                reservation_settled = True
        except BaseException:
            if reservation is not None and not reservation_settled:
                await budget_release(reservation_id=reservation.id)
            raise
