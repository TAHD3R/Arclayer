from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Protocol, cast
from uuid import UUID

from src.agents.registry import AgentRegistry
from src.agents.session import AgentSessionManager
from src.agents.types import AgentRunContext, AgentRunEvent, AgentRunEventType, AgentRunState
from src.common.types.json_types import JsonObject
from src.core.exceptions import APIError
from src.core.i18n import t
from src.core.logging import get_logger
from src.llm.runtime import LLMRequestContext, LLMRuntimeError
from src.modules.ai.schemas import AIReasoningEffort

logger = get_logger(__name__)


class AgentChatService(Protocol):
    async def chat(
        self,
        *,
        messages: list[dict[str, str]],
        context: LLMRequestContext,
        model: str | None = None,
        reasoning_effort: AIReasoningEffort | None = None,
    ) -> dict[str, Any]: ...

    def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        context: LLMRequestContext,
        model: str | None = None,
        reasoning_effort: AIReasoningEffort | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        budget_id: UUID | None = None,
    ) -> AsyncIterator[dict[str, Any]]: ...


class AgentRunEngine:
    def __init__(
        self,
        *,
        registry: AgentRegistry,
        sessions: AgentSessionManager,
        chat_service: AgentChatService,
    ) -> None:
        self._registry = registry
        self._sessions = sessions
        self._chat_service = chat_service

    async def run(
        self,
        *,
        context: AgentRunContext,
        agent_id: str,
        prompt: str,
        model: str | None,
        reasoning_effort: AIReasoningEffort | None = None,
        tool_inputs: dict[str, dict[str, Any]] | None = None,
    ) -> AgentRunState:
        agent = self._registry.require_agent(agent_id)
        self._validate_tool_inputs(agent_id=agent_id, tool_inputs=tool_inputs or {})
        state = await self._sessions.create_run(context=context, agent_id=agent_id, prompt=prompt, model=model)
        try:
            if await self._sessions.is_cancelled(run_id=state.id):
                return await self._sessions.cancel_run(run_id=state.id, context=context)

            tool_outputs = await self._run_tools(
                context=context,
                run_id=state.id,
                agent_id=agent_id,
                tool_inputs=tool_inputs or {},
            )
            if await self._sessions.is_cancelled(run_id=state.id):
                return await self._sessions.cancel_run(run_id=state.id, context=context)

            result = await self._chat_service.chat(
                messages=self._messages(system_prompt=agent.system_prompt, prompt=prompt, tool_outputs=tool_outputs),
                context=LLMRequestContext(
                    workspace_id=context.workspace_id,
                    user_id=context.user_id,
                    correlation_id=context.correlation_id,
                    source="agent",
                ),
                model=model,
                reasoning_effort=reasoning_effort,
            )
        except APIError as exc:
            return await self._sessions.fail_run(
                run_id=state.id,
                code=exc.error or "AGENT_RUN_FAILED",
                message=exc.message,
            )
        except LLMRuntimeError as exc:
            return await self._sessions.fail_run(run_id=state.id, code=exc.code, message=exc.message)
        except Exception:
            logger.exception("Agent run failed", agent_id=agent_id, run_id=str(state.id))
            return await self._sessions.fail_run(
                run_id=state.id,
                code="AGENT_RUN_FAILED",
                message=t("errors", "AGENT_RUN_FAILED"),
            )

        if await self._sessions.is_cancelled(run_id=state.id):
            return await self._sessions.cancel_run(run_id=state.id, context=context)

        return await self._sessions.complete_run(
            run_id=state.id,
            result={
                "content": result["content"],
                "model": result["model"],
                "usage": result["usage"],
                "finishReason": result["finish_reason"],
            },
        )

    async def stream(
        self,
        *,
        context: AgentRunContext,
        agent_id: str,
        prompt: str,
        model: str | None,
        reasoning_effort: AIReasoningEffort | None = None,
        tool_inputs: dict[str, dict[str, Any]] | None = None,
    ) -> AsyncIterator[AgentRunEvent]:
        agent = self._registry.require_agent(agent_id)
        self._validate_tool_inputs(agent_id=agent_id, tool_inputs=tool_inputs or {})
        state = await self._sessions.create_run(context=context, agent_id=agent_id, prompt=prompt, model=model)
        yield state.events[-1]

        try:
            tool_outputs: dict[str, Any] = {}
            async for event in self._run_tools_stream(
                context=context,
                run_id=state.id,
                agent_id=agent_id,
                tool_inputs=tool_inputs or {},
                tool_outputs=tool_outputs,
            ):
                yield event

            if await self._sessions.is_cancelled(run_id=state.id):
                yield (await self._sessions.cancel_run(run_id=state.id, context=context)).events[-1]
                return

            async for event in self._stream_llm_response(
                context=context,
                run_id=state.id,
                system_prompt=agent.system_prompt,
                prompt=prompt,
                model=model,
                reasoning_effort=reasoning_effort,
                tool_outputs=tool_outputs,
            ):
                yield event
        except APIError as exc:
            yield (
                await self._sessions.fail_run(
                    run_id=state.id,
                    code=exc.error or "AGENT_RUN_FAILED",
                    message=exc.message,
                )
            ).events[-1]
        except LLMRuntimeError as exc:
            yield (await self._sessions.fail_run(run_id=state.id, code=exc.code, message=exc.message)).events[-1]
        except Exception:
            logger.exception("Agent stream failed", agent_id=agent_id, run_id=str(state.id))
            yield (
                await self._sessions.fail_run(
                    run_id=state.id,
                    code="AGENT_RUN_FAILED",
                    message=t("errors", "AGENT_RUN_FAILED"),
                )
            ).events[-1]

    def _validate_tool_inputs(self, *, agent_id: str, tool_inputs: dict[str, dict[str, Any]]) -> None:
        for tool_name in tool_inputs:
            self._registry.require_agent_tool(agent_id=agent_id, tool_name=tool_name)

    async def _run_tools(
        self,
        *,
        context: AgentRunContext,
        run_id: UUID,
        agent_id: str,
        tool_inputs: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        tool_outputs: dict[str, Any] = {}
        for tool_name, input_data in tool_inputs.items():
            if await self._sessions.is_cancelled(run_id=run_id):
                await self._sessions.cancel_run(run_id=run_id, context=context)
                return tool_outputs

            await self._sessions.append_event(
                run_id=run_id,
                event=AgentRunEvent(event=AgentRunEventType.TOOL_STARTED, data={"toolName": tool_name}),
            )
            tool = self._registry.require_agent_tool(agent_id=agent_id, tool_name=tool_name)
            output = await tool.run(context, input_data)
            tool_outputs[tool_name] = output
            await self._sessions.append_event(
                run_id=run_id,
                event=AgentRunEvent(
                    event=AgentRunEventType.TOOL_COMPLETED,
                    data={"toolName": tool_name, "output": output},
                ),
            )
        await self._sessions.set_tool_outputs(run_id=run_id, tool_outputs=tool_outputs)
        return tool_outputs

    def _run_tools_stream(
        self,
        *,
        context: AgentRunContext,
        run_id: UUID,
        agent_id: str,
        tool_inputs: dict[str, dict[str, Any]],
        tool_outputs: dict[str, Any],
    ) -> AsyncIterator[AgentRunEvent]:
        async def _events() -> AsyncIterator[AgentRunEvent]:
            for tool_name, input_data in tool_inputs.items():
                if await self._sessions.is_cancelled(run_id=run_id):
                    await self._sessions.cancel_run(run_id=run_id, context=context)
                    return

                started = AgentRunEvent(event=AgentRunEventType.TOOL_STARTED, data={"toolName": tool_name})
                await self._sessions.append_event(run_id=run_id, event=started)
                yield started

                tool = self._registry.require_agent_tool(agent_id=agent_id, tool_name=tool_name)
                output = await tool.run(context, input_data)
                tool_outputs[tool_name] = output

                completed = AgentRunEvent(
                    event=AgentRunEventType.TOOL_COMPLETED,
                    data={"toolName": tool_name, "output": output},
                )
                await self._sessions.append_event(run_id=run_id, event=completed)
                yield completed

            await self._sessions.set_tool_outputs(run_id=run_id, tool_outputs=tool_outputs)

        return _events()

    async def _stream_llm_response(
        self,
        *,
        context: AgentRunContext,
        run_id: UUID,
        system_prompt: str,
        prompt: str,
        model: str | None,
        reasoning_effort: AIReasoningEffort | None,
        tool_outputs: dict[str, Any],
    ) -> AsyncIterator[AgentRunEvent]:
        async for chunk in self._chat_service.chat_stream(
            messages=self._messages(system_prompt=system_prompt, prompt=prompt, tool_outputs=tool_outputs),
            context=LLMRequestContext(
                workspace_id=context.workspace_id,
                user_id=context.user_id,
                correlation_id=context.correlation_id,
                source="agent",
            ),
            model=model,
            reasoning_effort=reasoning_effort,
        ):
            if await self._sessions.is_cancelled(run_id=run_id):
                yield (await self._sessions.cancel_run(run_id=run_id, context=context)).events[-1]
                return

            event_name = str(chunk.get("event") or "")
            raw_data = chunk.get("data")
            data = cast(dict[str, Any], raw_data) if isinstance(raw_data, dict) else {}
            if event_name == "message.delta":
                event = AgentRunEvent(event=AgentRunEventType.MESSAGE_DELTA, data=data)
                await self._sessions.append_event(run_id=run_id, event=event)
                yield event
                continue

            if event_name == "message.completed":
                result = self._stream_result(data)
                completed = await self._sessions.complete_run(run_id=run_id, result=result)
                yield completed.events[-1]
                return

    @staticmethod
    def _stream_result(data: dict[str, Any]) -> JsonObject:
        return {
            "content": str(data.get("full_content") or ""),
            "model": str(data.get("model") or ""),
            "usage": data.get("usage") if isinstance(data.get("usage"), dict) else {},
            "finishReason": str(data.get("finish_reason") or "stop"),
        }

    @staticmethod
    def _messages(
        *,
        system_prompt: str,
        prompt: str,
        tool_outputs: dict[str, Any],
    ) -> list[dict[str, str]]:
        messages = [{"role": "system", "content": system_prompt}]
        if tool_outputs:
            tool_context = json.dumps(tool_outputs, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            messages.append({"role": "system", "content": f"Read-only tool context: {tool_context}"})
        messages.append({"role": "user", "content": prompt})
        return messages
