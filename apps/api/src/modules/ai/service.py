from __future__ import annotations

from typing import Any, cast
from uuid import UUID

import httpx
import structlog

from src.config import Settings
from src.core.i18n import t
from src.core.services import BaseService
from src.llm.budget import BudgetExceededError
from src.llm.errors import LLMErrorCode
from src.llm.mock import MockLLMProvider
from src.llm.observability import ai_request_span
from src.llm.rate_limiter import RateLimitBackendUnavailable, RateLimiter, ValkeyRateLimiter
from src.llm.runtime import LLMRequestContext, LLMRuntime, LLMRuntimeError, compute_cost_micros, detect_provider
from src.models.ai.ai_budget import AIBudget
from src.modules.ai.schema import AIReasoningEffort
from src.modules.commerce.credits import CreditsExceededError, CreditsUnavailableError
from src.modules.system.ai_providers.configuration import (
    resolve_active_system_model,
    resolve_default_system_model,
)
from src.platform.cache.valkey import ValkeyClient, build_valkey
from src.settings.runtime import get_core_settings_value_cached

logger = structlog.get_logger("arclayer.ai.service")

_STRUCTURED_TOOL_DEFAULT_MAX_TOKENS = {
    "deepseek-v4-pro": 8192,
}


class AIChatService(BaseService):
    """Chat completion service wrapping LLMRuntime with context, budget, and error controls."""

    def __init__(
        self,
        settings: Settings,
        runtime: LLMRuntime | None = None,
        rate_limiter: RateLimiter | None = None,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._runtime = runtime or LLMRuntime(
            litellm_base_url=settings.ai.litellm_base_url,
            litellm_master_key=settings.ai.litellm_master_key,
            litellm_timeout_seconds=settings.ai.litellm_timeout_seconds,
            default_max_tokens=settings.ai.default_max_tokens,
            default_data_retention_enabled=settings.ai.data_retention_enabled,
            master_key_path=settings.ai.master_key_path,
            allow_platform_key=settings.ai.allow_platform_key,
        )
        if rate_limiter is not None:
            self._rate_limiter = rate_limiter
        elif settings.ai.rate_limit_enabled:
            if not settings.valkey.enabled:
                if settings.database.enabled:
                    raise RuntimeError("AI rate limiting requires Valkey when the database is enabled")
                self._rate_limiter = None
            else:
                raw_valkey = build_valkey(settings.valkey)
                self._rate_limiter = ValkeyRateLimiter(
                    valkey_client=ValkeyClient(
                        raw_valkey,
                        prefix=settings.valkey.prefix,
                        default_ttl=settings.valkey.default_ttl,
                    ),
                    capacity=settings.ai.rate_limit_capacity,
                    window_seconds=settings.ai.rate_limit_window_seconds,
                )
        else:
            self._rate_limiter = None

    async def _resolve_budget(self, workspace_id: UUID) -> AIBudget | None:
        """Get or create the current monthly budget for a workspace."""
        from datetime import UTC, datetime

        from src.llm.budget import get_or_create_budget
        from src.models.ai.ai_budget import BudgetSourceType

        try:
            now = datetime.now(UTC)
            period_start = now.strftime("%Y-%m-01")
            limit_micros = await self._resolve_monthly_budget_limit_micros()
            budget = await get_or_create_budget(
                source_type=BudgetSourceType.WORKSPACE,
                source_id=workspace_id,
                limit_micros=limit_micros,
                period_start=period_start,
            )
            if budget.limit_micros != limit_micros:
                budget.limit_micros = limit_micros
                await budget.save(update_fields=["limit_micros", "updated_at"])
            return budget
        except Exception:
            logger.exception(
                "Failed to resolve budget for workspace",
                workspace_id=str(workspace_id),
            )
            raise

    async def _resolve_monthly_budget_limit_micros(self) -> int:
        core = await get_core_settings_value_cached(self._settings)
        ai_agents = core.get("ai_agents") if isinstance(core, dict) else None
        if isinstance(ai_agents, dict):
            ai_agents = cast(dict[str, object], ai_agents)
            value = ai_agents.get("monthly_budget_micros")
            if isinstance(value, int) and not isinstance(value, bool) and value > 0:
                return value
        return self._settings.ai.default_monthly_limit_micros

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
        reasoning_effort: AIReasoningEffort | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        budget_id: UUID | None = None,
        provider_params: dict[str, Any] | None = None,
    ) -> dict:
        """Execute a chat completion with circuit breaker error handling.

        Returns a dict with keys: id, model, content, usage (dict with
        prompt_tokens/completion_tokens), finish_reason.
        When budget_id is provided, budget is reserved before the call
        and committed/released based on outcome.
        """
        resolved_model = await self._resolve_model(model)
        resolved_provider_params = _chat_provider_params(
            resolved_model,
            reasoning_effort,
            provider_params,
        )
        resolved_max_tokens = _chat_max_tokens(
            resolved_model,
            requested_max_tokens=max_tokens,
            provider_params=provider_params,
        )

        await self._check_rate_limit(str(context.workspace_id))

        # Resolve workspace budget for non-mock calls.
        if budget_id is None and not self._settings.ai.mock_enabled:
            budget = await self._resolve_budget(context.workspace_id)
            budget_id = budget.id if budget is not None else None

        if self._settings.ai.mock_enabled:
            async with ai_request_span(
                correlation_id=context.correlation_id,
                workspace_id=str(context.workspace_id),
                project_id=str(context.project_id) if context.project_id else None,
                model=resolved_model,
                source=context.source,
            ) as span_metrics:
                mock = MockLLMProvider()
                data = await mock.chat(
                    messages,
                    model=resolved_model,
                    **resolved_provider_params,
                    temperature=temperature,
                    max_tokens=resolved_max_tokens,
                )
                choice = data["choices"][0]
                usage = data.get("usage", {})
                span_metrics.prompt_tokens = usage.get("prompt_tokens", 0)
                span_metrics.completion_tokens = usage.get("completion_tokens", 0)
                span_metrics.cost_micros = 0
                span_metrics.user_id = str(context.user_id) if context.user_id else None
                return {
                    "id": data["id"],
                    "model": data.get("model", resolved_model),
                    "content": choice["message"]["content"],
                    "tool_calls": choice["message"].get("tool_calls") or [],
                    "usage": {
                        "prompt_tokens": usage.get("prompt_tokens", 0),
                        "completion_tokens": usage.get("completion_tokens", 0),
                    },
                    "finish_reason": choice.get("finish_reason", "stop"),
                }

        async with ai_request_span(
            correlation_id=context.correlation_id,
            workspace_id=str(context.workspace_id),
            project_id=str(context.project_id) if context.project_id else None,
            model=resolved_model,
            source=context.source,
        ) as span_metrics:
            try:
                result = await self._runtime.chat(
                    messages,
                    context=context,
                    model=resolved_model,
                    provider_params=resolved_provider_params,
                    temperature=temperature,
                    max_tokens=resolved_max_tokens,
                    budget_id=budget_id,
                )
            except LLMRuntimeError:
                # Already mapped by the runtime; re-raise as-is.
                raise
            except BudgetExceededError:
                raise LLMRuntimeError(
                    code=LLMErrorCode.BUDGET_EXCEEDED,
                    message=_llm_error_message(
                        LLMErrorCode.BUDGET_EXCEEDED,
                        default="Budget limit exceeded for this workspace",
                    ),
                    status_code=402,
                )
            except (CreditsExceededError, CreditsUnavailableError):
                raise LLMRuntimeError(
                    code=LLMErrorCode.AI_CREDITS_EXHAUSTED,
                    message=_llm_error_message(
                        LLMErrorCode.AI_CREDITS_EXHAUSTED,
                        default="This workspace has no AI credits available",
                    ),
                    status_code=402,
                )
            except httpx.ConnectError:
                self._raise_for_connect_error()
            except httpx.TimeoutException:
                raise LLMRuntimeError(
                    code=LLMErrorCode.PROVIDER_TIMEOUT,
                    message=_llm_error_message(
                        LLMErrorCode.PROVIDER_TIMEOUT,
                        default="LLM provider request timed out",
                    ),
                    status_code=504,
                )
            except httpx.HTTPStatusError as exc:
                self._raise_for_http_error(exc)
            except Exception:
                logger.exception(
                    "Unexpected error during LLM chat completion",
                    workspace_id=str(context.workspace_id),
                    project_id=str(context.project_id) if context.project_id else None,
                    agent_run_id=str(context.agent_run_id) if context.agent_run_id else None,
                    model=resolved_model,
                    source=context.source,
                )
                raise LLMRuntimeError(
                    code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                    message=_llm_error_message(
                        LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                        default="Unexpected error during LLM chat completion",
                    ),
                    status_code=500,
                )

            span_metrics.prompt_tokens = result.prompt_tokens
            span_metrics.completion_tokens = result.completion_tokens
            span_metrics.cost_micros = result.cost_micros
            span_metrics.user_id = str(context.user_id) if context.user_id else None

            return {
                "id": result.completion_id,
                "model": result.model,
                "content": result.content,
                "tool_calls": result.tool_calls,
                "usage": {
                    "prompt_tokens": result.prompt_tokens,
                    "completion_tokens": result.completion_tokens,
                },
                "finish_reason": result.finish_reason,
            }

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
        reasoning_effort: AIReasoningEffort | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        budget_id: UUID | None = None,
    ):
        """Stream a chat completion, yielding SSE event dicts.

        Each yielded dict follows the chat SSE event contract:
            {"event": "message.delta", "data": {"content": "..."}}
            {"event": "message.completed", "data": {...}}
            {"event": "error", "data": {"code": "...", "message": "..."}}
        """
        resolved_model = await self._resolve_model(model)
        await self._check_rate_limit(str(context.workspace_id))

        # Resolve workspace budget for non-mock calls.
        if budget_id is None and not self._settings.ai.mock_enabled:
            budget = await self._resolve_budget(context.workspace_id)
            budget_id = budget.id if budget is not None else None

        use_mock = self._settings.ai.mock_enabled

        if use_mock:
            async with ai_request_span(
                correlation_id=context.correlation_id,
                workspace_id=str(context.workspace_id),
                project_id=str(context.project_id) if context.project_id else None,
                model=resolved_model,
                source=context.source,
            ) as span_metrics:
                provider = MockLLMProvider()
                full_content = ""
                async for chunk in provider.chat_stream(
                    messages,
                    model=resolved_model,
                    **_reasoning_provider_params(resolved_model, reasoning_effort),
                    temperature=temperature,
                    max_tokens=max_tokens,
                ):
                    choice = chunk["choices"][0]
                    delta = choice.get("delta", {}) if isinstance(choice.get("delta"), dict) else {}
                    content = delta.get("content", "") or ""
                    reasoning = _extract_reasoning_delta(delta)
                    full_content += content
                    if reasoning:
                        yield {"event": "message.delta", "data": {"reasoning": reasoning}}
                    if content:
                        yield {"event": "message.delta", "data": {"content": content}}
                    if choice.get("finish_reason"):
                        usage = chunk.get("usage", {})
                        span_metrics.prompt_tokens = usage.get("prompt_tokens", 0)
                        span_metrics.completion_tokens = usage.get("completion_tokens", 0)
                        span_metrics.cost_micros = 0
                        span_metrics.user_id = str(context.user_id) if context.user_id else None
                        yield {
                            "event": "message.completed",
                            "data": {
                                "full_content": full_content,
                                "model": resolved_model,
                                "usage": {
                                    "prompt_tokens": usage.get("prompt_tokens", 0),
                                    "completion_tokens": usage.get("completion_tokens", 0),
                                },
                            },
                        }
        else:
            async with ai_request_span(
                correlation_id=context.correlation_id,
                workspace_id=str(context.workspace_id),
                project_id=str(context.project_id) if context.project_id else None,
                model=resolved_model,
                source=context.source,
            ) as span_metrics:
                full_content = ""
                try:
                    async for chunk in self._runtime.chat_stream(
                        messages,
                        context=context,
                        model=resolved_model,
                        provider_params=_reasoning_provider_params(resolved_model, reasoning_effort),
                        temperature=temperature,
                        max_tokens=max_tokens,
                        budget_id=budget_id,
                    ):
                        choices = chunk.get("choices", [])
                        if not choices:
                            continue
                        choice = choices[0]
                        delta = choice.get("delta", {}) if isinstance(choice.get("delta"), dict) else {}
                        content = delta.get("content", "") or ""
                        reasoning = _extract_reasoning_delta(delta)
                        full_content += content
                        if reasoning:
                            yield {"event": "message.delta", "data": {"reasoning": reasoning}}
                        if content:
                            yield {"event": "message.delta", "data": {"content": content}}
                        finish_reason = choice.get("finish_reason")
                        if finish_reason:
                            usage = chunk.get("usage", {})
                            prompt_tokens = usage.get("prompt_tokens", 0)
                            completion_tokens = usage.get("completion_tokens", 0)
                            configured_model = await resolve_active_system_model(resolved_model)
                            pricing = (
                                (
                                    configured_model.billing.input_cost_micros_per_million_tokens,
                                    configured_model.billing.output_cost_micros_per_million_tokens,
                                )
                                if configured_model is not None and configured_model.billing is not None
                                else None
                            )
                            actual_cost = compute_cost_micros(
                                resolved_model,
                                prompt_tokens,
                                completion_tokens,
                                pricing=pricing,
                            )

                            span_metrics.prompt_tokens = prompt_tokens
                            span_metrics.completion_tokens = completion_tokens
                            span_metrics.cost_micros = actual_cost
                            span_metrics.user_id = str(context.user_id) if context.user_id else None

                            yield {
                                "event": "message.completed",
                                "data": {
                                    "full_content": full_content,
                                    "model": resolved_model,
                                    "usage": {
                                        "prompt_tokens": prompt_tokens,
                                        "completion_tokens": completion_tokens,
                                    },
                                },
                            }
                except LLMRuntimeError:
                    raise
                except httpx.ConnectError:
                    self._raise_for_connect_error()
                except httpx.TimeoutException:
                    raise LLMRuntimeError(
                        code=LLMErrorCode.PROVIDER_TIMEOUT,
                        message=_llm_error_message(
                            LLMErrorCode.PROVIDER_TIMEOUT,
                            default="LLM provider streaming request timed out",
                        ),
                        status_code=504,
                    )
                except httpx.HTTPStatusError as exc:
                    self._raise_for_http_error(exc)
                except BudgetExceededError:
                    raise LLMRuntimeError(
                        code=LLMErrorCode.BUDGET_EXCEEDED,
                        message=_llm_error_message(
                            LLMErrorCode.BUDGET_EXCEEDED,
                            default="AI budget exceeded for this workspace",
                        ),
                        status_code=402,
                    )
                except (CreditsExceededError, CreditsUnavailableError):
                    raise LLMRuntimeError(
                        code=LLMErrorCode.AI_CREDITS_EXHAUSTED,
                        message=_llm_error_message(
                            LLMErrorCode.AI_CREDITS_EXHAUSTED,
                            default="This workspace has no AI credits available",
                        ),
                        status_code=402,
                    )
                except Exception:
                    raise LLMRuntimeError(
                        code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                        message=_llm_error_message(
                            LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                            default="Unexpected error during LLM chat completion",
                        ),
                        status_code=500,
                    )

    async def _resolve_model(self, model: str | None) -> str:
        if isinstance(model, str) and model.strip():
            return model.strip()
        if self._settings.ai.mock_enabled:
            return "mock"
        configured = await resolve_default_system_model()
        if configured is not None:
            return configured.public_model
        raise LLMRuntimeError(
            code=LLMErrorCode.PROVIDER_MODEL_UNAVAILABLE,
            message=_llm_error_message(
                LLMErrorCode.PROVIDER_MODEL_UNAVAILABLE,
                default="No default AI service model is configured",
            ),
            status_code=400,
        )

    async def _check_rate_limit(self, key: str) -> None:
        """Check rate limit before processing a request. No-op if limiter is disabled."""
        limiter = self._rate_limiter
        if limiter is None:
            return
        try:
            allowed = await limiter.is_allowed(key)
        except RateLimitBackendUnavailable as exc:
            raise LLMRuntimeError(
                code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                message=_llm_error_message(
                    LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                    default="AI requests are temporarily unavailable. Please try again.",
                ),
                status_code=503,
            ) from exc
        if not allowed:
            raise LLMRuntimeError(
                code=LLMErrorCode.RATE_LIMIT_EXCEEDED,
                message=_llm_error_message(
                    LLMErrorCode.RATE_LIMIT_EXCEEDED,
                    default="Rate limit exceeded for AI requests",
                ),
                status_code=429,
            )

    def _raise_for_connect_error(self) -> None:
        raise LLMRuntimeError(
            code=LLMErrorCode.SYSTEM_LITELLM_UNREACHABLE,
            message=_llm_error_message(
                LLMErrorCode.SYSTEM_LITELLM_UNREACHABLE,
                default="LiteLLM proxy is unreachable",
            ),
            status_code=503,
        )

    def _raise_for_http_error(self, exc: httpx.HTTPStatusError) -> None:
        status = exc.response.status_code
        body = ""
        try:
            body = exc.response.text
        except Exception:
            pass

        if status == 429:
            raise LLMRuntimeError(
                code=LLMErrorCode.RATE_LIMIT_EXCEEDED,
                message=_llm_error_message(
                    LLMErrorCode.RATE_LIMIT_EXCEEDED,
                    default="Rate limit exceeded for LLM requests",
                ),
                status_code=429,
            )

        if status == 400 and ("model" in body.lower() or "not found" in body.lower()):
            raise LLMRuntimeError(
                code=LLMErrorCode.PROVIDER_MODEL_UNAVAILABLE,
                message=_llm_error_message(
                    LLMErrorCode.PROVIDER_MODEL_UNAVAILABLE,
                    default="Requested model is not available",
                ),
                status_code=400,
            )

        if status >= 500:
            raise LLMRuntimeError(
                code=LLMErrorCode.PROVIDER_UNAVAILABLE,
                message=_llm_error_message(
                    LLMErrorCode.PROVIDER_UNAVAILABLE,
                    default="LLM provider returned an error (HTTP {status})",
                    status=status,
                ),
                status_code=503,
            )

        raise LLMRuntimeError(
            code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
            message=_llm_error_message(
                LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                default="Unexpected HTTP error from LLM provider (HTTP {status})",
                status=status,
            ),
            status_code=502,
        )


def _llm_error_message(code: LLMErrorCode, *, default: str, **kwargs: Any) -> str:
    return t("errors", code.value, default=default, **kwargs)


def _extract_reasoning_delta(delta: dict[str, Any]) -> str:
    """Return explicit provider reasoning summaries from stream deltas.

    This only surfaces fields returned by the provider/LiteLLM. It does not
    infer or generate hidden chain-of-thought.
    """
    for key in ("reasoning", "reasoning_content", "thinking"):
        value = delta.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def _reasoning_provider_params(model: str, effort: AIReasoningEffort | None) -> dict[str, Any]:
    if effort is None:
        return {}

    provider = detect_provider(model)
    if provider == "deepseek":
        if effort == "low":
            return {"thinking": {"type": "disabled"}}
        if effort == "medium":
            return {"thinking": {"type": "enabled"}, "reasoning_effort": "high"}
        return {"thinking": {"type": "enabled"}, "reasoning_effort": "max"}

    return {"reasoning_effort": effort}


def _chat_provider_params(
    model: str,
    reasoning_effort: AIReasoningEffort | None,
    provider_params: dict[str, Any] | None,
) -> dict[str, Any]:
    params = {
        **_reasoning_provider_params(model, reasoning_effort),
        **(provider_params or {}),
    }
    forced_tool_name = _forced_function_tool_name(params)
    if detect_provider(model) == "deepseek" and forced_tool_name is not None:
        logger.info(
            "Using DeepSeek-compatible non-thinking automatic Tool selection for a named function",
            model=model,
            tool_name=forced_tool_name,
        )
        params["tool_choice"] = "auto"
        params["thinking"] = {"type": "disabled"}
    return params


def _forced_function_tool_name(params: dict[str, Any]) -> str | None:
    tool_choice = params.get("tool_choice")
    if not isinstance(tool_choice, dict) or tool_choice.get("type") != "function":
        return None
    function = tool_choice.get("function")
    if not isinstance(function, dict):
        return None
    name = function.get("name")
    return name if isinstance(name, str) and name else None


def _chat_max_tokens(
    model: str,
    *,
    requested_max_tokens: int | None,
    provider_params: dict[str, Any] | None,
) -> int | None:
    if requested_max_tokens is not None:
        return requested_max_tokens
    if _forced_function_tool_name(provider_params or {}) is None:
        return None
    return _STRUCTURED_TOOL_DEFAULT_MAX_TOKENS.get(model)
