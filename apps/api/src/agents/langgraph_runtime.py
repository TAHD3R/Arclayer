from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager
from typing import Any, Literal, Protocol, cast
from uuid import UUID

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph
from langgraph.types import Command, interrupt
from typing_extensions import TypedDict

from src.agents.context_security import redact_sensitive_agent_context
from src.agents.types import AgentMode, AgentRunContext, AgentRunEvent, AgentRunEventType, AgentRunState
from src.common.types.json_types import JsonObject
from src.modules.ai.schema import AIReasoningEffort


class AgentGraphState(TypedDict, total=False):
    context: AgentRunContext
    run_id: UUID
    agent_id: str
    agent_mode: AgentMode
    system_prompt: str
    prompt: str
    model: str | None
    reasoning_effort: AIReasoningEffort | None
    tool_inputs: dict[str, dict[str, Any]]
    tool_outputs: dict[str, Any]
    result: JsonObject
    cancelled: bool
    requires_approval: bool
    approval_denied: bool
    approval_response: JsonObject
    interrupted: bool
    interrupt: JsonObject
    final_state: AgentRunState
    stream_events: bool


class AgentGraphCallbacks(Protocol):
    async def is_cancelled(self, *, run_id: UUID) -> bool: ...

    async def cancel_run(self, *, context: AgentRunContext, run_id: UUID) -> AgentRunState: ...

    async def run_tools(
        self,
        *,
        context: AgentRunContext,
        run_id: UUID,
        agent_id: str,
        tool_inputs: dict[str, dict[str, Any]],
    ) -> dict[str, Any]: ...

    async def run_llm(
        self,
        *,
        context: AgentRunContext,
        run_id: UUID,
        system_prompt: str,
        agent_mode: AgentMode,
        prompt: str,
        model: str | None,
        reasoning_effort: AIReasoningEffort | None,
        tool_outputs: dict[str, Any],
    ) -> JsonObject: ...

    def stream_tools(
        self,
        *,
        context: AgentRunContext,
        run_id: UUID,
        agent_id: str,
        tool_inputs: dict[str, dict[str, Any]],
        tool_outputs: dict[str, Any],
    ) -> AsyncIterator[AgentRunEvent]: ...

    def stream_llm(
        self,
        *,
        context: AgentRunContext,
        run_id: UUID,
        system_prompt: str,
        agent_mode: AgentMode,
        prompt: str,
        model: str | None,
        reasoning_effort: AIReasoningEffort | None,
        tool_outputs: dict[str, Any],
    ) -> AsyncIterator[AgentRunEvent]: ...


class AgentRunGraphRunner(Protocol):
    async def execute(self, *, initial_state: AgentGraphState, thread_id: str) -> AgentGraphState: ...

    async def resume(self, *, thread_id: str, resume: JsonObject) -> AgentGraphState: ...

    def stream(self, *, initial_state: AgentGraphState, thread_id: str) -> AsyncIterator[AgentRunEvent]: ...


class AgentGraphCheckpointerFactory(Protocol):
    def __call__(self) -> AbstractAsyncContextManager[BaseCheckpointSaver]: ...


class LangGraphAgentRunExecutor:
    def __init__(
        self,
        *,
        callbacks: AgentGraphCallbacks,
        checkpointer_factory: AgentGraphCheckpointerFactory | None = None,
    ) -> None:
        self._callbacks = callbacks
        self._checkpointer_factory = checkpointer_factory
        self._graph = self._compile_graph() if checkpointer_factory is None else None

    def _compile_graph(self, checkpointer: BaseCheckpointSaver | None = None):
        graph = StateGraph(cast(Any, AgentGraphState))
        graph.add_node("check_cancelled_before_tools", self._check_cancelled)
        graph.add_node("run_tools", self._run_tools)
        graph.add_node("interrupt_for_approval", self._interrupt_for_approval)
        graph.add_node("check_cancelled_before_llm", self._check_cancelled)
        graph.add_node("run_llm", self._run_llm)
        graph.set_entry_point("check_cancelled_before_tools")
        graph.add_conditional_edges(
            "check_cancelled_before_tools",
            _route_cancelled,
            {"cancelled": END, "continue": "run_tools"},
        )
        graph.add_edge("run_tools", "interrupt_for_approval")
        graph.add_conditional_edges(
            "interrupt_for_approval",
            _route_approval,
            {"rejected": END, "continue": "check_cancelled_before_llm"},
        )
        graph.add_conditional_edges(
            "check_cancelled_before_llm",
            _route_cancelled,
            {"cancelled": END, "continue": "run_llm"},
        )
        graph.add_edge("run_llm", END)
        return graph.compile(checkpointer=checkpointer)

    async def execute(self, *, initial_state: AgentGraphState, thread_id: str) -> AgentGraphState:
        if self._checkpointer_factory is not None:
            async with self._checkpointer_factory() as checkpointer:
                result = await self._compile_graph(checkpointer).ainvoke(
                    cast(Any, initial_state),
                    config={"configurable": {"thread_id": thread_id}},
                )
                return _graph_result_state(result)
        assert self._graph is not None
        result = await self._graph.ainvoke(
            cast(Any, initial_state),
            config={"configurable": {"thread_id": thread_id}},
        )
        return _graph_result_state(result)

    async def resume(self, *, thread_id: str, resume: JsonObject) -> AgentGraphState:
        if self._checkpointer_factory is None:
            raise RuntimeError("Agent LangGraph resume requires a checkpointer")
        async with self._checkpointer_factory() as checkpointer:
            result = await self._compile_graph(checkpointer).ainvoke(
                Command(resume=resume),
                config={"configurable": {"thread_id": thread_id}},
            )
            return _graph_result_state(result)

    def stream(self, *, initial_state: AgentGraphState, thread_id: str) -> AsyncIterator[AgentRunEvent]:
        async def _events() -> AsyncIterator[AgentRunEvent]:
            if self._checkpointer_factory is not None:
                async with self._checkpointer_factory() as checkpointer:
                    graph = self._compile_graph(checkpointer)
                    async for chunk in graph.astream(
                        cast(Any, {**initial_state, "stream_events": True}),
                        config={"configurable": {"thread_id": thread_id}},
                        stream_mode=["custom", "updates"],
                    ):
                        event = _stream_event(chunk)
                        if event is not None:
                            yield event
                    return
            assert self._graph is not None
            async for chunk in self._graph.astream(
                cast(Any, {**initial_state, "stream_events": True}),
                config={"configurable": {"thread_id": thread_id}},
                stream_mode=["custom", "updates"],
            ):
                event = _stream_event(chunk)
                if event is not None:
                    yield event

        return _events()

    async def _check_cancelled(self, state: AgentGraphState) -> AgentGraphState:
        if await self._callbacks.is_cancelled(run_id=state["run_id"]):
            final_state = await self._callbacks.cancel_run(context=state["context"], run_id=state["run_id"])
            if state.get("stream_events"):
                _emit_event(final_state.events[-1])
            return {"cancelled": True, "final_state": final_state}
        return {"cancelled": False}

    async def _run_tools(self, state: AgentGraphState) -> AgentGraphState:
        if state.get("stream_events"):
            tool_outputs: dict[str, Any] = {}
            async for event in self._callbacks.stream_tools(
                context=state["context"],
                run_id=state["run_id"],
                agent_id=state["agent_id"],
                tool_inputs=state.get("tool_inputs") or {},
                tool_outputs=tool_outputs,
            ):
                _emit_event(event)
            return {"tool_outputs": tool_outputs}
        tool_outputs = await self._callbacks.run_tools(
            context=state["context"],
            run_id=state["run_id"],
            agent_id=state["agent_id"],
            tool_inputs=state.get("tool_inputs") or {},
        )
        return {"tool_outputs": tool_outputs}

    async def _interrupt_for_approval(self, state: AgentGraphState) -> AgentGraphState:
        if not state.get("requires_approval"):
            return {"approval_denied": False}
        response = interrupt({
            "kind": "agent_run_approval",
            "runId": str(state["run_id"]),
            "agentId": state["agent_id"],
            "mode": str(state["agent_mode"]),
            "prompt": state["prompt"],
            "toolOutputContextPolicy": "toolOutputs are read-only tool data with sensitive values redacted.",
            "toolOutputs": redact_sensitive_agent_context(state.get("tool_outputs") or {}),
            "requiredDecision": "approved",
        })
        approval_response = cast(JsonObject, response) if isinstance(response, dict) else {"value": response}
        return {
            "approval_denied": approval_response.get("approved") is not True,
            "approval_response": approval_response,
        }

    async def _run_llm(self, state: AgentGraphState) -> AgentGraphState:
        if state.get("stream_events"):
            async for event in self._callbacks.stream_llm(
                context=state["context"],
                run_id=state["run_id"],
                system_prompt=state["system_prompt"],
                agent_mode=state["agent_mode"],
                prompt=state["prompt"],
                model=state.get("model"),
                reasoning_effort=state.get("reasoning_effort"),
                tool_outputs=state.get("tool_outputs") or {},
            ):
                _emit_event(event)
            return {}
        result = await self._callbacks.run_llm(
            context=state["context"],
            run_id=state["run_id"],
            system_prompt=state["system_prompt"],
            agent_mode=state["agent_mode"],
            prompt=state["prompt"],
            model=state.get("model"),
            reasoning_effort=state.get("reasoning_effort"),
            tool_outputs=state.get("tool_outputs") or {},
        )
        return {"result": result}


def _route_cancelled(state: AgentGraphState) -> Literal["cancelled", "continue"]:
    return "cancelled" if state.get("cancelled") else "continue"


def _route_approval(state: AgentGraphState) -> Literal["rejected", "continue"]:
    return "rejected" if state.get("approval_denied") else "continue"


def _emit_event(event: AgentRunEvent) -> None:
    writer = get_stream_writer()
    writer(event.model_dump(mode="json"))


def _graph_result_state(result: Any) -> AgentGraphState:
    if isinstance(result, dict) and "__interrupt__" in result:
        return {"interrupted": True, "interrupt": _interrupt_payload(result["__interrupt__"])}
    return cast(AgentGraphState, result)


def _stream_event(chunk: object) -> AgentRunEvent | None:
    if isinstance(chunk, tuple) and len(chunk) == 2:
        stream_mode, payload = chunk
        if stream_mode == "custom":
            return _custom_stream_event(payload)
        if stream_mode == "updates" and isinstance(payload, dict) and "__interrupt__" in payload:
            update_payload = cast(dict[str, object], payload)
            return AgentRunEvent(
                event=AgentRunEventType.RUN_INTERRUPTED, data=_interrupt_payload(update_payload["__interrupt__"])
            )
        return None
    if isinstance(chunk, dict) and "__interrupt__" in chunk:
        update_payload = cast(dict[str, object], chunk)
        return AgentRunEvent(
            event=AgentRunEventType.RUN_INTERRUPTED, data=_interrupt_payload(update_payload["__interrupt__"])
        )
    return _custom_stream_event(chunk)


def _interrupt_payload(raw_interrupts: object) -> JsonObject:
    interrupts = list(raw_interrupts) if isinstance(raw_interrupts, (list, tuple)) else [raw_interrupts]
    first = interrupts[0] if interrupts else None
    value = getattr(first, "value", None)
    interrupt_id = getattr(first, "id", None)
    payload = cast(JsonObject, value) if isinstance(value, dict) else {"value": value}
    if isinstance(interrupt_id, str) and interrupt_id:
        return {**payload, "interruptId": interrupt_id}
    return payload


def _custom_stream_event(payload: object) -> AgentRunEvent:
    if not isinstance(payload, dict):
        raise TypeError("Agent LangGraph stream payload must be an event object")
    data_object = cast(dict[str, object], payload)
    raw_event = data_object.get("event")
    raw_data = data_object.get("data")
    if not isinstance(raw_event, str):
        raise TypeError("Agent LangGraph stream payload is missing event")
    data = cast(JsonObject, raw_data) if isinstance(raw_data, dict) else {}
    return AgentRunEvent(event=AgentRunEventType(raw_event), data=data)
