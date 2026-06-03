from __future__ import annotations

from uuid import UUID

import httpx
import structlog

from src.config import Settings
from src.llm.budget import BudgetExceededError
from src.llm.errors import LLMErrorCode
from src.llm.mock import MockLLMProvider
from src.llm.observability import ai_request_span
from src.llm.rate_limiter import TokenBucket
from src.llm.runtime import LLMRequestContext, LLMRuntime, LLMRuntimeError, compute_cost_micros, detect_provider
from src.models.ai.model_policy import ModelPolicy

logger = structlog.get_logger("arclayer.ai.service")


class AIChatService:
    """Chat completion service wrapping LLMRuntime with workspace context and budget controls.

    Responsible for:
    - Workspace context extraction and forwarding
    - Model policy check (stub for Phase 1)
    - Budget integration (stub for Phase 1)
    - Error code mapping for circuit breaker
    """

    def __init__(
        self,
        settings: Settings,
        runtime: LLMRuntime | None = None,
        rate_limiter: TokenBucket | None = None,
    ) -> None:
        self._settings = settings
        self._runtime = runtime or LLMRuntime(
            litellm_base_url=settings.ai.litellm_base_url,
        )
        if rate_limiter is not None:
            self._rate_limiter = rate_limiter
        elif settings.ai.rate_limit_enabled:
            self._rate_limiter = TokenBucket(
                capacity=settings.ai.rate_limit_capacity,
                refill_rate=settings.ai.rate_limit_capacity / settings.ai.rate_limit_window_seconds,
                refill_interval=1.0,
            )
        else:
            self._rate_limiter = None
        # TODO (Phase 4): Wire ValkeyRateLimiter for global rate limiting across
        # multi-worker deployments. The current TokenBucket is process-local.

    async def _resolve_budget(self, workspace_id: UUID) -> AIBudget | None:
        """Get or create a monthly budget for a workspace.

        Falls back to None if the database is unavailable (e.g. in tests).
        """
        from datetime import UTC, datetime

        from src.llm.budget import get_or_create_budget
        from src.models.ai.ai_budget import BudgetSourceType

        try:
            now = datetime.now(UTC)
            period_start = now.strftime("%Y-%m-01")
            budget = await get_or_create_budget(
                source_type=BudgetSourceType.WORKSPACE,
                source_id=workspace_id,
                limit_micros=self._settings.ai.default_monthly_limit_micros,
                period_start=period_start,
            )
            return budget
        except Exception:
            logger.warning(
                "Failed to resolve budget for workspace",
                workspace_id=str(workspace_id),
            )
            return None

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        budget_id: UUID | None = None,
    ) -> dict:
        """Execute a chat completion with circuit breaker error handling.

        Returns a dict with keys: id, model, content, usage (dict with
        prompt_tokens/completion_tokens), finish_reason.
        When budget_id is provided, budget is reserved before the call
        and committed/released based on outcome.
        """
        resolved_model = model or self._settings.ai.default_model

        await self._check_rate_limit(str(context.workspace_id))

        provider_params = self._resolve_provider_params(resolved_model)

        # Resolve workspace budget for non-mock calls.
        if budget_id is None and not self._settings.ai.mock_enabled:
            budget = await self._resolve_budget(context.workspace_id)
            budget_id = budget.id if budget is not None else None

        if self._settings.ai.mock_enabled:
            async with ai_request_span(
                correlation_id=context.correlation_id,
                workspace_id=str(context.workspace_id),
                model=resolved_model,
                source=context.source,
            ) as span_metrics:
                mock = MockLLMProvider()
                data = await mock.chat(
                    messages,
                    model=resolved_model,
                    temperature=temperature,
                    max_tokens=max_tokens,
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
                    "usage": {
                        "prompt_tokens": usage.get("prompt_tokens", 0),
                        "completion_tokens": usage.get("completion_tokens", 0),
                    },
                    "finish_reason": choice.get("finish_reason", "stop"),
                }

        async with ai_request_span(
            correlation_id=context.correlation_id,
            workspace_id=str(context.workspace_id),
            model=resolved_model,
            source=context.source,
        ) as span_metrics:
            try:
                result = await self._runtime.chat(
                    messages,
                    context=context,
                    model=resolved_model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    budget_id=budget_id,
                    provider_params=provider_params,
                )
            except LLMRuntimeError:
                # Already mapped by the runtime; re-raise as-is.
                raise
            except BudgetExceededError:
                raise LLMRuntimeError(
                    code=LLMErrorCode.BUDGET_EXCEEDED,
                    message="Budget limit exceeded for this workspace",
                    status_code=402,
                )
            except httpx.ConnectError:
                self._raise_for_connect_error()
            except httpx.TimeoutException:
                raise LLMRuntimeError(
                    code=LLMErrorCode.PROVIDER_TIMEOUT,
                    message="LLM provider request timed out",
                    status_code=504,
                )
            except httpx.HTTPStatusError as exc:
                self._raise_for_http_error(exc)
            except Exception:
                raise LLMRuntimeError(
                    code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                    message="Unexpected error during LLM chat completion",
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
        resolved_model = model or self._settings.ai.default_model
        await self._check_rate_limit(str(context.workspace_id))

        provider_params = self._resolve_provider_params(resolved_model)

        # Resolve workspace budget for non-mock calls.
        if budget_id is None and not self._settings.ai.mock_enabled:
            budget = await self._resolve_budget(context.workspace_id)
            budget_id = budget.id if budget is not None else None

        use_mock = self._settings.ai.mock_enabled

        if use_mock:
            async with ai_request_span(
                correlation_id=context.correlation_id,
                workspace_id=str(context.workspace_id),
                model=resolved_model,
                source=context.source,
            ) as span_metrics:
                provider = MockLLMProvider()
                full_content = ""
                async for chunk in provider.chat_stream(
                    messages,
                    model=resolved_model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                ):
                    choice = chunk["choices"][0]
                    delta = choice.get("delta", {}) if isinstance(choice.get("delta"), dict) else {}
                    content = delta.get("content", "") or ""
                    full_content += content
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
                model=resolved_model,
                source=context.source,
            ) as span_metrics:
                full_content = ""
                try:
                    async for chunk in self._runtime.chat_stream(
                        messages,
                        context=context,
                        model=resolved_model,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        budget_id=budget_id,
                        provider_params=provider_params,
                    ):
                        choices = chunk.get("choices", [])
                        if not choices:
                            continue
                        choice = choices[0]
                        delta = choice.get("delta", {}) if isinstance(choice.get("delta"), dict) else {}
                        content = delta.get("content", "") or ""
                        full_content += content
                        if content:
                            yield {"event": "message.delta", "data": {"content": content}}
                        finish_reason = choice.get("finish_reason")
                        if finish_reason:
                            usage = chunk.get("usage", {})
                            prompt_tokens = usage.get("prompt_tokens", 0)
                            completion_tokens = usage.get("completion_tokens", 0)
                            actual_cost = compute_cost_micros(resolved_model, prompt_tokens, completion_tokens)

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
                except httpx.ConnectError:
                    self._raise_for_connect_error()
                except httpx.TimeoutException:
                    raise LLMRuntimeError(
                        code=LLMErrorCode.PROVIDER_TIMEOUT,
                        message="LLM provider streaming request timed out",
                        status_code=504,
                    )
                except httpx.HTTPStatusError as exc:
                    self._raise_for_http_error(exc)
                except BudgetExceededError:
                    raise LLMRuntimeError(
                        code=LLMErrorCode.BUDGET_EXCEEDED,
                        message="AI budget exceeded for this workspace",
                        status_code=402,
                    )
                except Exception:
                    raise LLMRuntimeError(
                        code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                        message="Unexpected error during LLM chat completion",
                        status_code=500,
                    )

    async def _check_rate_limit(self, key: str) -> None:
        """Check rate limit before processing a request. No-op if limiter is disabled."""
        if self._rate_limiter is None:
            return
        if not self._rate_limiter.consume(1):
            raise LLMRuntimeError(
                code=LLMErrorCode.RATE_LIMIT_EXCEEDED,
                message="Rate limit exceeded for AI requests",
                status_code=429,
            )

    def _resolve_provider_params(self, model: str) -> dict:
        """Resolve data retention provider parameters for a given model.

        Uses a default ModelPolicy derived from AISettings.data_retention_enabled.
        If the policy disables retention but the provider cannot be identified,
        logs an audit warning and returns an empty dict.
        """
        policy = ModelPolicy(
            id=UUID(int=0),
            name="_default",
            scope="workspace",
            data_retention_enabled=self._settings.ai.data_retention_enabled,
        )
        provider = detect_provider(model)
        params = policy.to_provider_params(provider)
        if not policy.data_retention_enabled and provider == "unknown":
            logger.warning(
                "Data retention opt-out cannot be honored for unknown provider",
                model=model,
                provider=provider,
                error_code="PROVIDER_DATA_RETENTION_NOT_HONORED",
            )
        return params

    def _raise_for_connect_error(self) -> None:
        raise LLMRuntimeError(
            code=LLMErrorCode.SYSTEM_LITELLM_UNREACHABLE,
            message="LiteLLM proxy is unreachable",
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
                message="Rate limit exceeded for LLM requests",
                status_code=429,
            )

        if status == 400 and ("model" in body.lower() or "not found" in body.lower()):
            raise LLMRuntimeError(
                code=LLMErrorCode.PROVIDER_MODEL_UNAVAILABLE,
                message="Requested model is not available",
                status_code=400,
            )

        if status >= 500:
            raise LLMRuntimeError(
                code=LLMErrorCode.PROVIDER_UNAVAILABLE,
                message=f"LLM provider returned an error (HTTP {status})",
                status_code=503,
            )

        raise LLMRuntimeError(
            code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
            message=f"Unexpected HTTP error from LLM provider (HTTP {status})",
            status_code=502,
        )
