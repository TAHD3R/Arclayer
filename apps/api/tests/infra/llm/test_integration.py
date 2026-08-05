"""Integration and contract tests for the AI LLM infrastructure.

Covers Phase 1 contract validation:
- LiteLLM client contract (request/response format)
- Mock LLM integration with AIChatService
- Budget concurrent reservation safety
- SSE disconnect/cancel cleanup
- Schema and migration contracts
- End-to-end API chat flow
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import AISettings, Settings, get_settings
from src.llm.budget import BudgetExceededError, reserve
from src.llm.errors import ERROR_CODE_STATUS, LLMErrorCode
from src.llm.litellm_client import LiteLLMClient
from src.llm.mock import MockLLMProvider
from src.llm.provider import BaseLLMProvider
from src.llm.runtime import ChatResult, LLMRequestContext, LLMRuntime, LLMRuntimeError
from src.models.ai.ai_api_key import AIAPIKey
from src.models.ai.ai_audit_log import AIAuditLog
from src.models.ai.ai_budget import AIBudget, BudgetSourceType
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus
from src.models.ai.ai_usage_daily import AIUsageDaily
from src.models.ai.model_policy import ModelPolicy
from src.models.ai.user_key_grant import (
    GrantApprovalState,
    UserKeyWorkspaceGrant,
    can_transition_grant,
    is_grant_active,
)
from src.modules.ai.model_catalog import (
    AI_MODEL_CATALOG_MASTER_KEY_REQUIRED,
    AI_MODEL_CATALOG_PROVIDER_CONFLICT,
    AIModelCatalogUnavailableError,
    list_ai_model_catalog,
)
from src.modules.ai.provider_icon import AIProviderIcon
from src.modules.ai.router import router as ai_router
from src.modules.ai.schema import AIModelCatalogItem, AIModelCatalogResponse, AIReasoningEffort
from src.modules.ai.service import AIChatService
from src.modules.auth.http.service import get_current_user_id
from src.modules.system.ai_providers.configuration import configured_models_from_records

# ── Helpers ──────────────────────────────────────────────────────────────


class _MockResponse:
    """Simple mock for httpx.Response that works with LiteLLMClient."""

    def __init__(self, status_code: int, json_data: dict) -> None:
        self.status_code = status_code
        self._json_data = json_data
        self._lines: list[str] | None = None

    def set_lines(self, lines: list[str]) -> None:
        self._lines = lines

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}",
                request=MagicMock(),
                response=cast(httpx.Response, self),
            )

    def json(self) -> dict:
        return self._json_data

    async def aiter_lines(self):
        if self._lines is None:
            return
        for line in self._lines:
            yield line


class _MockAsyncClient:
    """Mock for httpx.AsyncClient that captures request details."""

    def __init__(self) -> None:
        self.post_calls: list[dict] = []
        self.get_calls: list[dict] = []
        self._responses: list[_MockResponse] = []
        self._stream_responses: list[_MockResponse] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def add_response(self, resp: _MockResponse) -> None:
        self._responses.append(resp)

    def add_stream_response(self, resp: _MockResponse) -> None:
        self._stream_responses.append(resp)

    async def post(self, url, *, json=None, headers=None):
        self.post_calls.append({"url": url, "json": json, "headers": headers})
        if self._responses:
            return self._responses.pop(0)
        return _MockResponse(200, {"id": "default"})

    async def get(self, url, *, headers=None):
        self.get_calls.append({"url": url, "headers": headers})
        if self._responses:
            return self._responses.pop(0)
        return _MockResponse(200, {"status": "healthy"})

    def stream(self, method, url, *, json=None, headers=None):
        self.post_calls.append({"url": url, "json": json, "headers": headers})
        if self._stream_responses:
            return _MockStreamContext(self._stream_responses.pop(0))
        return _MockStreamContext(_MockResponse(200, {}))


class _MockStreamContext:
    """Async context manager wrapping a _MockResponse for streaming."""

    def __init__(self, response: _MockResponse) -> None:
        self._response = response

    async def __aenter__(self):
        return self._response

    async def __aexit__(self, *args):
        pass


class _BlockingProvider(BaseLLMProvider):
    def __init__(self) -> None:
        self.chat_started = asyncio.Event()

    async def health(self) -> dict[str, str]:
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
        self.chat_started.set()
        await asyncio.Event().wait()
        raise AssertionError("blocking provider chat should be cancelled before completion")

    def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ):
        async def _events():
            raise AssertionError("blocking provider stream is not used by this test")
            yield

        return _events()


# ── 1. LiteLLM Contract Tests (mock-based) ────────────────────────────


class TestLiteLLMContract:
    """Verify that LiteLLMClient sends properly formatted requests
    matching the OpenAI chat completions API contract."""

    async def test_request_format(self) -> None:
        """Verify request URL, method, headers, and payload structure."""
        client = LiteLLMClient(base_url="http://test:4000", virtual_key="test-key-abc")
        mock_client = _MockAsyncClient()
        mock_client.add_response(
            _MockResponse(
                200,
                {
                    "id": "chatcmpl-xxx",
                    "object": "chat.completion",
                    "created": 1234567890,
                    "model": "gpt-4o-mini",
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": "Hello there"},
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
                },
            )
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            response = await client.chat(
                [{"role": "user", "content": "Hello"}],
                model="gpt-4o-mini",
                temperature=0.7,
                max_tokens=100,
            )

        assert len(mock_client.post_calls) == 1
        call = mock_client.post_calls[0]
        assert call["url"].endswith("/v1/chat/completions")

        payload = call["json"]
        assert payload["model"] == "gpt-4o-mini"
        assert payload["messages"] == [{"role": "user", "content": "Hello"}]
        assert payload["temperature"] == 0.7
        assert payload["max_tokens"] == 100

        headers = call["headers"]
        assert headers["Authorization"] == "Bearer test-key-abc"

        assert response["object"] == "chat.completion"
        assert response["choices"][0]["message"]["content"] == "Hello there"

    async def test_chat_response_parsing(self) -> None:
        """Verify response JSON is correctly parsed."""
        client = LiteLLMClient(base_url="http://test:4000", virtual_key="key")
        mock_client = _MockAsyncClient()
        mock_client.add_response(
            _MockResponse(
                200,
                {
                    "id": "chatcmpl-abc",
                    "object": "chat.completion",
                    "created": 123,
                    "model": "gpt-4o",
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": "Response text"},
                            "finish_reason": "length",
                        }
                    ],
                    "usage": {"prompt_tokens": 20, "completion_tokens": 50, "total_tokens": 70},
                },
            )
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            response = await client.chat([{"role": "user", "content": "Hi"}], model="gpt-4o")

        assert response["id"] == "chatcmpl-abc"
        assert response["model"] == "gpt-4o"
        assert response["choices"][0]["finish_reason"] == "length"
        assert response["usage"]["prompt_tokens"] == 20
        assert response["usage"]["completion_tokens"] == 50

    async def test_stream_response_parsing(self) -> None:
        """Verify streaming SSE chunks are parsed correctly."""
        client = LiteLLMClient(base_url="http://test:4000", virtual_key="test-key")
        mock_client = _MockAsyncClient()

        chunk1 = json.dumps({
            "id": "chunk-1",
            "object": "chat.completion.chunk",
            "created": 123,
            "model": "gpt-4o-mini",
            "choices": [{"index": 0, "delta": {"content": "Hello"}, "finish_reason": None}],
        })
        chunk2 = json.dumps({
            "id": "chunk-1",
            "object": "chat.completion.chunk",
            "created": 123,
            "model": "gpt-4o-mini",
            "choices": [{"index": 0, "delta": {"content": " world"}, "finish_reason": "stop"}],
        })

        resp = _MockResponse(200, {})
        resp.set_lines([f"data: {chunk1}", f"data: {chunk2}", "data: [DONE]"])
        mock_client.add_stream_response(resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            chunks = []
            async for c in client.chat_stream(
                [{"role": "user", "content": "Test"}],
                model="gpt-4o-mini",
            ):
                chunks.append(c)

        assert len(chunks) == 2
        assert chunks[0]["choices"][0]["delta"]["content"] == "Hello"
        assert chunks[1]["choices"][0]["delta"]["content"] == " world"

    async def test_4xx_error_handling(self) -> None:
        """Verify 4xx responses raise HTTPStatusError before response is read."""
        client = LiteLLMClient(base_url="http://test:4000", virtual_key="test-key")
        mock_client = _MockAsyncClient()
        err_resp = _MockResponse(400, {"error": {"message": "Bad request", "type": "invalid_request_error"}})
        mock_client.add_response(err_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await client.chat([{"role": "user", "content": "Hi"}], model="gpt-4o-mini")
        assert exc_info.value.response.status_code == 400

    async def test_5xx_error_handling(self) -> None:
        """Verify 5xx responses raise HTTPStatusError."""
        client = LiteLLMClient(base_url="http://test:4000", virtual_key="test-key")
        mock_client = _MockAsyncClient()
        err_resp = _MockResponse(503, {"error": {"message": "Service unavailable"}})
        mock_client.add_response(err_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await client.chat([{"role": "user", "content": "Hi"}], model="gpt-4o-mini")
        assert exc_info.value.response.status_code == 503


# ── 2. Mock LLM Integration Tests ──────────────────────────────────────


class TestMockLLMIntegration:
    """Full flow: MockLLMProvider -> AIChatService.chat() -> response."""

    async def test_full_flow_chat(self) -> None:
        """Verify AIChatService works with a mock runtime end to end."""
        mock_runtime = AsyncMock(spec=LLMRuntime)
        mock_runtime.chat.return_value = ChatResult(
            completion_id="mock-cid",
            model="gpt-4o-mini",
            content="Mock response content",
            prompt_tokens=15,
            completion_tokens=25,
            cost_micros=0,
            finish_reason="stop",
        )

        settings = get_settings()
        service = AIChatService(settings, runtime=mock_runtime)
        context = LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents")
        with patch.object(service, "_resolve_budget", new=AsyncMock(return_value=None)):
            result = await service.chat(
                [{"role": "user", "content": "Hello"}],
                context=context,
                model="gpt-4o-mini",
            )

        assert result["id"] == "mock-cid"
        assert result["model"] == "gpt-4o-mini"
        assert result["content"] == "Mock response content"
        assert result["usage"]["prompt_tokens"] == 15
        assert result["usage"]["completion_tokens"] == 25
        assert result["finish_reason"] == "stop"
        mock_runtime.chat.assert_awaited_once()

    async def test_budget_resolution_uses_core_settings_monthly_limit(self) -> None:
        settings = get_settings()
        service = AIChatService(settings, runtime=AsyncMock(spec=LLMRuntime))
        budget = SimpleNamespace(
            id=uuid4(),
            limit_micros=100_000_000,
            save=AsyncMock(),
        )
        workspace_id = uuid4()

        async def core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
            return {"ai_agents": {"monthly_budget_micros": 25_000_000}}

        with (
            patch("src.modules.ai.service.get_core_settings_value_cached", new=core_settings),
            patch("src.llm.budget.get_or_create_budget", new=AsyncMock(return_value=budget)) as get_budget,
        ):
            resolved = await service._resolve_budget(workspace_id)

        assert resolved is budget
        get_budget.assert_awaited_once()
        assert get_budget.await_args is not None
        assert get_budget.await_args.kwargs["limit_micros"] == 25_000_000
        assert budget.limit_micros == 25_000_000
        budget.save.assert_awaited_once_with(update_fields=["limit_micros", "updated_at"])

    async def test_deepseek_reasoning_effort_maps_to_provider_params(self) -> None:
        """Verify reasoning effort reaches LiteLLM as provider params."""
        settings = get_settings()

        cases: list[tuple[AIReasoningEffort, dict[str, object]]] = [
            ("low", {"thinking": {"type": "disabled"}}),
            ("medium", {"thinking": {"type": "enabled"}, "reasoning_effort": "high"}),
            ("high", {"thinking": {"type": "enabled"}, "reasoning_effort": "max"}),
        ]
        for effort, expected in cases:
            mock_runtime = AsyncMock(spec=LLMRuntime)
            mock_runtime.chat.return_value = ChatResult(
                completion_id=f"{effort}-cid",
                model="deepseek-v4-pro",
                content="ok",
                prompt_tokens=1,
                completion_tokens=1,
                cost_micros=0,
                finish_reason="stop",
            )
            service = AIChatService(settings, runtime=mock_runtime)
            with patch.object(service, "_resolve_budget", new=AsyncMock(return_value=None)):
                await service.chat(
                    [{"role": "user", "content": "Hello"}],
                    context=LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents"),
                    model="deepseek-v4-pro",
                    reasoning_effort=effort,
                )

            assert mock_runtime.chat.await_args.kwargs["provider_params"] == expected

    async def test_deepseek_named_function_tool_choice_uses_non_thinking_auto_mode(self) -> None:
        settings = get_settings()
        mock_runtime = AsyncMock(spec=LLMRuntime)
        mock_runtime.chat.return_value = ChatResult(
            completion_id="forced-tool-cid",
            model="deepseek-v4-pro",
            content="",
            tool_calls=[],
            prompt_tokens=1,
            completion_tokens=1,
            cost_micros=0,
            finish_reason="tool_calls",
        )
        service = AIChatService(settings, runtime=mock_runtime)
        forced_tool_params = {
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "submit_candidate",
                        "parameters": {"type": "object", "additionalProperties": False},
                    },
                }
            ],
            "tool_choice": {
                "type": "function",
                "function": {"name": "submit_candidate"},
            },
        }

        with patch.object(service, "_resolve_budget", new=AsyncMock(return_value=None)):
            await service.chat(
                [{"role": "user", "content": "Submit one typed candidate."}],
                context=LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents"),
                model="deepseek-v4-pro",
                provider_params=forced_tool_params,
            )

        assert mock_runtime.chat.await_args.kwargs["provider_params"] == {
            **forced_tool_params,
            "tool_choice": "auto",
            "thinking": {"type": "disabled"},
        }
        assert mock_runtime.chat.await_args.kwargs["max_tokens"] == 8192

    async def test_streaming_flow(self, monkeypatch) -> None:
        """Verify AIChatService.chat_stream() yields SSE events."""
        monkeypatch.setenv("AI__MOCK_ENABLED", "1")
        get_settings.cache_clear()
        settings = get_settings()

        service = AIChatService(settings)
        context = LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents")
        events = []
        async for event in service.chat_stream(
            [{"role": "user", "content": "Hello streaming"}],
            context=context,
        ):
            events.append(event)

        assert len(events) >= 2
        assert events[0]["event"] == "message.delta"
        assert len(events[0]["data"]["content"]) > 0
        last = events[-1]
        assert last["event"] == "message.completed"
        assert "Hello streaming" in last["data"]["full_content"]

    async def test_error_propagation(self) -> None:
        """Verify LLMRuntimeError from the runtime propagates through the service."""
        mock_runtime = AsyncMock(spec=LLMRuntime)
        mock_runtime.chat.side_effect = LLMRuntimeError(
            code="PROVIDER_UNAVAILABLE",
            message="Upstream provider unavailable",
            status_code=503,
        )

        settings = get_settings()
        service = AIChatService(settings, runtime=mock_runtime)
        context = LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents")

        with pytest.raises(LLMRuntimeError) as exc_info:
            with patch.object(service, "_resolve_budget", new=AsyncMock(return_value=None)):
                await service.chat(
                    [{"role": "user", "content": "Hello"}],
                    context=context,
                )
        assert exc_info.value.code == "PROVIDER_UNAVAILABLE"
        assert exc_info.value.status_code == 503

    async def test_mock_integration_error_propagation(self) -> None:
        """Verify MockLLMProvider errors propagate correctly."""
        from src.llm.mock import MockLLMError

        provider = MockLLMProvider(fail_every=1)
        with pytest.raises(MockLLMError) as exc_info:
            await provider.chat([{"role": "user", "content": "Fail"}])
        assert exc_info.value.status_code == 503
        assert exc_info.value.error_type == "service_unavailable"


class TestLLMRuntimeBudgetCancellation:
    @pytest.mark.asyncio
    async def test_chat_releases_budget_reservation_when_cancelled(self) -> None:
        provider = _BlockingProvider()
        runtime = LLMRuntime(provider=provider)
        reservation_id = uuid4()

        with (
            patch.object(
                runtime,
                "_resolve_call_context",
                new=AsyncMock(return_value=("virtual-key", 4, 100, 4096, {}, None)),
            ),
            patch(
                "src.llm.budget.reserve",
                new=AsyncMock(return_value=SimpleNamespace(id=reservation_id)),
            ) as reserve_mock,
            patch("src.llm.budget.release", new=AsyncMock()) as release_mock,
            patch("src.llm.budget.commit", new=AsyncMock()) as commit_mock,
        ):
            chat_task = asyncio.create_task(
                runtime.chat(
                    [{"role": "user", "content": "Hello"}],
                    context=LLMRequestContext(
                        workspace_id=uuid4(),
                        capability_key="ai.agents",
                        user_id=uuid4(),
                    ),
                    model="gpt-4o-mini",
                    budget_id=uuid4(),
                )
            )
            await asyncio.wait_for(provider.chat_started.wait(), timeout=1)

            chat_task.cancel()

            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(chat_task, timeout=1)

        reserve_mock.assert_awaited_once()
        release_mock.assert_awaited_once_with(reservation_id=reservation_id)
        commit_mock.assert_not_awaited()


# ── 3. Budget Concurrent Reservation Tests ─────────────────────────────


class TestBudgetConcurrentReservations:
    """Concurrent reservation safety with a mock DB executor."""

    @pytest.mark.asyncio
    async def test_10_concurrent_1500_against_10000_limit(self) -> None:
        """10 concurrent reservations each requesting 1500 against a budget
        of 10000 micros.  Only 6 should succeed (10000/1500 = 6.66 -> 6)."""
        budget_id = uuid4()
        total_limit = 10000
        request_amount = 1500
        expected_success = total_limit // request_amount  # 6

        reserved_tracker = 0

        async def concurrent_execute(sql: str, params: list) -> tuple[list[str], list[dict]]:
            nonlocal reserved_tracker
            if "UPDATE ai_budgets" in sql:
                amount = params[0]
                if reserved_tracker + amount <= total_limit:
                    reserved_tracker += amount
                    return (["id"], [{"id": str(budget_id)}])
                return (["id"], [])
            if "INSERT INTO" in sql or "CREATE" in sql:
                return ([], [])
            return (["id"], [])

        mock_execute = AsyncMock(side_effect=concurrent_execute)

        with (
            patch(
                "src.llm.budget.AIBudget.get",
                return_value=AIBudget(
                    id=budget_id,
                    source_type=BudgetSourceType.WORKSPACE,
                    source_id=uuid4(),
                    limit_micros=total_limit,
                    spent_micros=0,
                    reserved_micros=0,
                    period_start="2026-06-01",
                ),
            ),
            patch("src.llm.budget.AIBudgetReservation.create") as mock_create,
        ):
            mock_create.return_value = AIBudgetReservation(
                id=uuid4(),
                budget_id=budget_id,
                request_id=uuid4(),
                estimated_cost_micros=request_amount,
                reserved_cost_micros=request_amount,
                status=ReservationStatus.RESERVED,
                expires_at=datetime.now(UTC) + timedelta(seconds=300),
            )

            async def try_reserve(amount: int) -> bool:
                try:
                    await reserve(
                        budget_id=budget_id,
                        request_id=uuid4(),
                        estimated_cost_micros=amount,
                        _execute=mock_execute,
                    )
                    return True
                except BudgetExceededError:
                    return False

            results = await asyncio.gather(*[try_reserve(request_amount) for _ in range(10)])

        success_count = sum(results)
        assert success_count == expected_success, (
            f"Expected {expected_success} successful reservations, got {success_count}"
        )
        assert reserved_tracker <= total_limit, f"Reserved {reserved_tracker} exceeds limit {total_limit}"


# ── 4. SSE Disconnect/Cancel Tests ─────────────────────────────────────


class TestSSEDisconnectCancel:
    """Simulate client disconnect during streaming."""

    @pytest.mark.asyncio
    async def test_cancel_during_stream_cleans_up(self, monkeypatch) -> None:
        """Cancel a streaming task mid-stream and verify clean termination."""
        monkeypatch.setenv("AI__MOCK_ENABLED", "1")
        get_settings.cache_clear()
        settings = get_settings()

        service = AIChatService(settings)
        context = LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents")

        async def consume_stream():
            events = []
            async for event in service.chat_stream(
                [{"role": "user", "content": "Cancel test"}],
                context=context,
            ):
                events.append(event)
            return events

        task = asyncio.create_task(consume_stream())
        await asyncio.sleep(0.02)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        # Verify no lingering asyncio tasks from the stream
        all_tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        stream_tasks = [t for t in all_tasks if "chat_stream" in str(t) or "consume_stream" in str(t)]
        assert len(stream_tasks) == 0, "Lingering stream tasks found after cancellation"

    @pytest.mark.asyncio
    async def test_abort_does_not_leave_stale_state(self, monkeypatch) -> None:
        """Abort mid-stream and verify the provider state is consistent."""
        monkeypatch.setenv("AI__MOCK_ENABLED", "1")
        get_settings.cache_clear()
        settings = get_settings()

        service = AIChatService(settings)
        context = LLMRequestContext(workspace_id=uuid4(), capability_key="ai.agents")

        async def consume_partial():
            count = 0
            async for event in service.chat_stream(
                [{"role": "user", "content": "Partial"}],
                context=context,
            ):
                count += 1
                if count >= 2:
                    break
            return count

        count = await consume_partial()
        assert count >= 1

        # A fresh stream should work after partial consumption
        events = []
        async for event in service.chat_stream(
            [{"role": "user", "content": "Fresh stream"}],
            context=context,
        ):
            events.append(event)
        assert len(events) >= 2
        assert events[-1]["event"] == "message.completed"


# ── 5. Schema Contract Tests ───────────────────────────────────────────


class TestSchemaContracts:
    """Verify schema definitions, defaults, transitions, and mappings."""

    def test_ai_settings_defaults(self, monkeypatch) -> None:
        """Verify AISettings loads with expected defaults."""
        ai = AISettings()
        assert ai.litellm_base_url == "http://localhost:4000"
        assert ai.default_max_tokens == 4096
        assert ai.default_monthly_limit_micros == 100_000_000
        assert ai.reservation_ttl_seconds == 300
        assert ai.rate_limit_enabled is True
        assert ai.rate_limit_capacity == 100
        assert ai.rate_limit_window_seconds == 60
        assert ai.data_retention_enabled is False
        assert ai.mock_enabled is False
        assert ai.audit_log_enabled is True
        assert ai.metrics_enabled is True

    def test_migration_has_all_model_tables(self) -> None:
        """Verify every AI model table exists via their Meta.db_table."""
        model_tables = {
            AIBudget._meta.db_table,
            AIBudgetReservation._meta.db_table,
            ModelPolicy._meta.db_table,
            UserKeyWorkspaceGrant._meta.db_table,
            AIAuditLog._meta.db_table,
            AIAPIKey._meta.db_table,
            AIUsageDaily._meta.db_table,
        }

        expected_tables = {
            "ai_budgets",
            "ai_budget_reservations",
            "ai_model_policies",
            "user_key_workspace_grants",
            "ai_audit_log",
            "ai_api_keys",
            "ai_usage_daily",
        }
        assert model_tables == expected_tables, (
            f"Mismatch: {model_tables - expected_tables} extra, {expected_tables - model_tables} missing"
        )

    def test_all_error_codes_have_status_codes(self) -> None:
        """Verify every LLMErrorCode enum value has an entry in ERROR_CODE_STATUS."""
        for code in LLMErrorCode:
            assert code in ERROR_CODE_STATUS, f"Missing status code for {code}"
            status = ERROR_CODE_STATUS[code]
            assert isinstance(status, int), f"Status code for {code} is not an int"
            assert 400 <= status < 600, f"Status code {status} for {code} out of range"

    def test_grant_state_transitions(self) -> None:
        """Verify GrantApprovalState transitions match the domain contract."""
        # Valid transitions
        assert can_transition_grant(GrantApprovalState.PENDING, GrantApprovalState.APPROVED)
        assert can_transition_grant(GrantApprovalState.PENDING, GrantApprovalState.DENIED)
        assert can_transition_grant(GrantApprovalState.APPROVED, GrantApprovalState.REVOKED)
        assert can_transition_grant(GrantApprovalState.DENIED, GrantApprovalState.PENDING)

        # Invalid transitions
        assert not can_transition_grant(GrantApprovalState.REVOKED, GrantApprovalState.PENDING)
        assert not can_transition_grant(GrantApprovalState.REVOKED, GrantApprovalState.APPROVED)
        assert not can_transition_grant(GrantApprovalState.APPROVED, GrantApprovalState.DENIED)
        assert not can_transition_grant(GrantApprovalState.DENIED, GrantApprovalState.APPROVED)

        # Active grant check
        assert is_grant_active(GrantApprovalState.APPROVED)
        assert not is_grant_active(GrantApprovalState.PENDING)
        assert not is_grant_active(GrantApprovalState.DENIED)
        assert not is_grant_active(GrantApprovalState.REVOKED)

    def test_model_policy_to_provider_params(self) -> None:
        """Verify ModelPolicy.to_provider_params() for OpenAI and Anthropic."""
        # Retention enabled -> no params
        policy_enabled = ModelPolicy(
            id=uuid4(),
            name="test",
            scope="workspace",
            data_retention_enabled=True,
        )
        assert policy_enabled.to_provider_params("openai") == {}
        assert policy_enabled.to_provider_params("anthropic") == {}

        # Retention disabled -> provider-specific opt-out params
        policy_disabled = ModelPolicy(
            id=uuid4(),
            name="test",
            scope="workspace",
            data_retention_enabled=False,
        )
        assert policy_disabled.to_provider_params("openai") == {"store": False}
        # Anthropic has no per-request retention parameter (TOS-level only).
        assert policy_disabled.to_provider_params("anthropic") == {}

        # Unknown provider -> empty dict
        assert policy_disabled.to_provider_params("unknown") == {}

    def test_error_codes_are_unique(self) -> None:
        """Verify no duplicate error codes."""
        codes = list(LLMErrorCode)
        assert len(codes) == len(set(codes))


class TestAIModelCatalog:
    """Verify the Admin model selector catalog is loaded from backend configuration."""

    def test_platform_catalog_uses_only_explicit_system_model_mappings(self) -> None:
        provider_id = uuid4()
        models = configured_models_from_records(
            [
                {
                    "id": provider_id,
                    "provider": "deepseek",
                    "metadata_json": {
                        "source": "system.ai_providers",
                        "model_mappings": [
                            {
                                "public_model": "deepseek-v4-pro",
                                "provider_model": "deepseek-chat",
                                "label": "DeepSeek V4 Pro",
                                "description": "Configured model description",
                                "label_i18n": {"zh-CN": "DeepSeek V4 专业版"},
                                "description_i18n": {"zh-CN": "已配置的模型介绍"},
                            }
                        ],
                        "default_model": "deepseek-v4-pro",
                    },
                },
                {
                    "id": uuid4(),
                    "provider": "openai",
                    "metadata_json": {"source": "legacy.platform_key"},
                },
            ],
        )

        assert [(item.provider, item.public_model, item.is_default) for item in models] == [
            ("deepseek", "deepseek-v4-pro", True)
        ]
        assert models[0].label == "DeepSeek V4 Pro"
        assert models[0].description == "Configured model description"
        assert models[0].label_i18n == {"zh-CN": "DeepSeek V4 专业版"}

    async def test_catalog_loads_litellm_models_and_filters_mock(self) -> None:
        settings = get_settings()
        settings.ai = settings.ai.model_copy(
            update={
                "litellm_master_key": "master-key",
                "mock_enabled": False,
            },
        )

        with (
            patch(
                "src.modules.ai.model_catalog.LiteLLMClient.list_models",
                new=AsyncMock(
                    return_value={
                        "data": [
                            {"id": "mock"},
                            {"id": "gpt-4o"},
                            {"id": "deepseek-v4-pro"},
                        ],
                    },
                ),
            ),
            patch(
                "src.modules.ai.model_catalog.list_active_system_models",
                new=AsyncMock(
                    return_value=[
                        SimpleNamespace(
                            public_model="deepseek-v4-pro",
                            provider="deepseek",
                            label="DeepSeek V4 Pro Custom",
                            description="Configured model description",
                            label_i18n={"zh-CN": "DeepSeek V4 自定义版"},
                            description_i18n={"zh-CN": "配置的模型介绍"},
                            is_default=True,
                            provider_icon=AIProviderIcon(
                                light_url="/provider-icons/deepseek-light.svg",
                                dark_url="/provider-icons/deepseek-dark.svg",
                            ),
                        )
                    ]
                ),
            ),
        ):
            catalog = await list_ai_model_catalog(settings, workspace_id=uuid4(), user_id=uuid4())

        assert catalog.default_model == "deepseek-v4-pro"
        assert [model.id for model in catalog.models] == ["deepseek-v4-pro"]
        assert catalog.models[0].provider == "deepseek"
        assert catalog.models[0].label == "DeepSeek V4 Pro Custom"
        assert catalog.models[0].description == "Configured model description"
        assert catalog.models[0].label_i18n == {"zh-CN": "DeepSeek V4 自定义版"}
        assert catalog.models[0].provider_icon == AIProviderIcon(
            light_url="/provider-icons/deepseek-light.svg",
            dark_url="/provider-icons/deepseek-dark.svg",
        )

    async def test_catalog_uses_error_code_when_master_key_missing(self) -> None:
        settings = get_settings()
        settings.ai = settings.ai.model_copy(
            update={
                "litellm_master_key": None,
                "mock_enabled": False,
            },
        )

        with pytest.raises(AIModelCatalogUnavailableError) as exc_info:
            await list_ai_model_catalog(settings, workspace_id=uuid4(), user_id=uuid4())

        assert exc_info.value.code == AI_MODEL_CATALOG_MASTER_KEY_REQUIRED
        assert str(exc_info.value) == AI_MODEL_CATALOG_MASTER_KEY_REQUIRED

    async def test_catalog_rejects_duplicate_public_models_instead_of_silently_hiding_one(self) -> None:
        settings = get_settings()
        settings.ai = settings.ai.model_copy(
            update={"litellm_master_key": "master-key", "mock_enabled": False},
        )
        duplicate_models = [
            SimpleNamespace(
                public_model="shared-model",
                provider="deepseek",
                label="Shared DeepSeek",
                description=None,
                label_i18n={},
                description_i18n={},
                is_default=True,
                provider_icon=None,
            ),
            SimpleNamespace(
                public_model="shared-model",
                provider="openai",
                label="Shared OpenAI",
                description=None,
                label_i18n={},
                description_i18n={},
                is_default=True,
                provider_icon=None,
            ),
        ]

        with (
            patch(
                "src.modules.ai.model_catalog.LiteLLMClient.list_models",
                new=AsyncMock(return_value={"data": [{"id": "shared-model"}]}),
            ),
            patch(
                "src.modules.ai.model_catalog.list_active_system_models",
                new=AsyncMock(return_value=duplicate_models),
            ),
            pytest.raises(AIModelCatalogUnavailableError) as exc_info,
        ):
            await list_ai_model_catalog(settings, workspace_id=uuid4(), user_id=uuid4())

        assert exc_info.value.code == AI_MODEL_CATALOG_PROVIDER_CONFLICT

    async def test_catalog_returns_empty_payload_when_no_selectable_models_exist(self) -> None:
        settings = get_settings()
        settings.ai = settings.ai.model_copy(
            update={
                "litellm_master_key": "master-key",
                "mock_enabled": False,
            },
        )

        with (
            patch(
                "src.modules.ai.model_catalog.LiteLLMClient.list_models",
                new=AsyncMock(return_value={"data": [{"id": "deepseek-v4-pro"}]}),
            ),
            patch(
                "src.modules.ai.model_catalog.list_active_system_models",
                new=AsyncMock(return_value=[]),
            ),
        ):
            catalog = await list_ai_model_catalog(settings, workspace_id=uuid4(), user_id=uuid4())

        assert catalog.default_model is None
        assert catalog.models == []

    async def test_catalog_uses_visible_configured_provider_default_model(self) -> None:
        settings = get_settings()
        settings.ai = settings.ai.model_copy(
            update={
                "litellm_master_key": "master-key",
                "mock_enabled": False,
            },
        )

        with (
            patch(
                "src.modules.ai.model_catalog.LiteLLMClient.list_models",
                new=AsyncMock(
                    return_value={
                        "data": [
                            {"id": "deepseek-v4-pro"},
                            {"id": "gpt-4o"},
                        ],
                    },
                ),
            ),
            patch(
                "src.modules.ai.model_catalog.list_active_system_models",
                new=AsyncMock(
                    return_value=[
                        SimpleNamespace(
                            public_model="deepseek-v4-pro",
                            provider="deepseek",
                            label="DeepSeek",
                            description=None,
                            label_i18n={},
                            description_i18n={},
                            is_default=True,
                            provider_icon=None,
                        ),
                        SimpleNamespace(
                            public_model="gpt-4o",
                            provider="openai",
                            label="GPT",
                            description=None,
                            label_i18n={},
                            description_i18n={},
                            is_default=False,
                            provider_icon=None,
                        ),
                    ]
                ),
            ),
        ):
            catalog = await list_ai_model_catalog(
                settings,
                workspace_id=uuid4(),
                user_id=uuid4(),
                default_mode="plan",
                reasoning_effort="high",
            )

        assert catalog.default_model == "deepseek-v4-pro"
        assert catalog.default_mode == "plan"
        assert catalog.reasoning_effort == "high"
        assert [model.id for model in catalog.models] == ["deepseek-v4-pro", "gpt-4o"]

    async def test_catalog_does_not_invent_default_when_configured_default_is_unavailable(self) -> None:
        settings = get_settings()
        settings.ai = settings.ai.model_copy(
            update={
                "litellm_master_key": "master-key",
                "mock_enabled": False,
            },
        )

        with (
            patch(
                "src.modules.ai.model_catalog.LiteLLMClient.list_models",
                new=AsyncMock(
                    return_value={
                        "data": [
                            {"id": "deepseek-v4-pro"},
                            {"id": "gpt-4o"},
                        ],
                    },
                ),
            ),
            patch(
                "src.modules.ai.model_catalog.list_active_system_models",
                new=AsyncMock(
                    return_value=[
                        SimpleNamespace(
                            public_model="claude-sonnet-4-6",
                            provider="deepseek",
                            label="Unavailable default",
                            description=None,
                            label_i18n={},
                            description_i18n={},
                            is_default=True,
                            provider_icon=None,
                        ),
                        SimpleNamespace(
                            public_model="gpt-4o",
                            provider="openai",
                            label="GPT",
                            description=None,
                            label_i18n={},
                            description_i18n={},
                            is_default=False,
                            provider_icon=None,
                        ),
                    ]
                ),
            ),
        ):
            catalog = await list_ai_model_catalog(settings, workspace_id=uuid4(), user_id=uuid4())

        assert catalog.default_model is None


# ── 6. End-to-End Chat Flow (mock-based) ──────────────────────────────


def _build_test_app(
    *,
    user_id: UUID,
) -> FastAPI:
    """Build a FastAPI test app for the public AI model catalog contract."""
    app = FastAPI()
    app.include_router(ai_router, prefix="/api/v1/chat")

    async def override_user_id() -> UUID:
        return user_id

    app.dependency_overrides[get_current_user_id] = override_user_id
    return app


class TestModelCatalogEndpoint:
    """Public model catalog endpoint contract tests."""

    async def test_model_catalog_endpoint_returns_backend_models(self) -> None:
        """GET /api/v1/chat/models returns the backend-owned model catalog."""
        settings = get_settings()
        user_id = uuid4()
        app = _build_test_app(
            user_id=user_id,
        )
        catalog = AIModelCatalogResponse(
            default_model="deepseek-v4-pro",
            models=[
                AIModelCatalogItem(
                    id="deepseek-v4-pro",
                    provider="deepseek",
                    label="DeepSeek V4 Pro",
                    label_i18n={"zh-CN": "DeepSeek V4 专业版"},
                    description="Configured description",
                    description_i18n={"zh-CN": "配置的介绍"},
                    provider_icon=AIProviderIcon(
                        light_url="/provider-icons/deepseek-light.svg",
                        dark_url="/provider-icons/deepseek-dark.svg",
                    ),
                )
            ],
        )

        transport = ASGITransport(app=app, raise_app_exceptions=True)
        workspace_id = uuid4()
        catalog_mock = AsyncMock(return_value=catalog)

        async def _core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
            _ = ttl_seconds
            return {
                "ai_agents": {
                    "default_mode": "plan",
                    "reasoning_effort": "high",
                }
            }

        with (
            patch(
                "src.modules.ai.router.resolve_workspace_context_by_id",
                new=AsyncMock(return_value=SimpleNamespace(workspace_id=workspace_id)),
            ),
            patch("src.modules.ai.router.get_core_settings_value_cached", new=_core_settings),
            patch("src.modules.ai.router.list_ai_model_catalog", new=catalog_mock),
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as http:
                response = await http.get(f"/api/v1/chat/models?workspaceId={encode_uuid(workspace_id)}")

        assert response.status_code == 200, response.text
        catalog_mock.assert_awaited_once_with(
            settings,
            workspace_id=workspace_id,
            user_id=user_id,
            default_mode="plan",
            reasoning_effort="high",
        )
        data = response.json()["data"]
        assert data["defaultModel"] == "deepseek-v4-pro"
        assert data["defaultMode"] == "build"
        assert data["reasoningEffort"] == "medium"
        assert data["models"][0]["id"] == "deepseek-v4-pro"
        assert data["models"][0]["label"] == "DeepSeek V4 Pro"
        assert data["models"][0]["labelI18n"] == {"zh-CN": "DeepSeek V4 专业版"}
        assert data["models"][0]["providerIcon"] == {
            "lightUrl": "/provider-icons/deepseek-light.svg",
            "darkUrl": "/provider-icons/deepseek-dark.svg",
        }

    async def test_model_catalog_endpoint_returns_empty_catalog(self) -> None:
        user_id = uuid4()
        workspace_id = uuid4()
        app = _build_test_app(user_id=user_id)
        catalog = AIModelCatalogResponse(default_model=None, models=[])

        transport = ASGITransport(app=app, raise_app_exceptions=True)
        with (
            patch(
                "src.modules.ai.router.resolve_workspace_context_by_id",
                new=AsyncMock(return_value=SimpleNamespace(workspace_id=workspace_id)),
            ),
            patch(
                "src.modules.ai.router.list_ai_model_catalog",
                new=AsyncMock(return_value=catalog),
            ),
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as http:
                response = await http.get(f"/api/v1/chat/models?workspaceId={encode_uuid(workspace_id)}")

        assert response.status_code == 200, response.text
        assert response.json()["data"]["defaultModel"] is None
        assert response.json()["data"]["models"] == []

    async def test_model_catalog_endpoint_returns_infrastructure_error_code(self) -> None:
        user_id = uuid4()
        workspace_id = uuid4()
        app = _build_test_app(
            user_id=user_id,
        )

        transport = ASGITransport(app=app, raise_app_exceptions=True)
        catalog_error = AIModelCatalogUnavailableError(AI_MODEL_CATALOG_MASTER_KEY_REQUIRED)

        with (
            patch(
                "src.modules.ai.router.resolve_workspace_context_by_id",
                new=AsyncMock(return_value=SimpleNamespace(workspace_id=workspace_id)),
            ),
            patch(
                "src.modules.ai.router.list_ai_model_catalog",
                new=AsyncMock(side_effect=catalog_error),
            ),
        ):
            async with AsyncClient(transport=transport, base_url="http://test") as http:
                response = await http.get(f"/api/v1/chat/models?workspaceId={encode_uuid(workspace_id)}")

        assert response.status_code == 503, response.text
        body = response.json()
        envelope = body.get("detail", body)
        assert envelope["error"] == AI_MODEL_CATALOG_MASTER_KEY_REQUIRED
        assert envelope["message"] == AI_MODEL_CATALOG_MASTER_KEY_REQUIRED
