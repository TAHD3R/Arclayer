from __future__ import annotations

from typing import Any, Literal, cast

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, StateGraph
from langgraph.types import Command, interrupt
from pydantic import TypeAdapter
from typing_extensions import TypedDict

from src.agents.langgraph_runtime import AgentGraphCheckpointerFactory
from src.common.types.json_types import JsonObject
from src.modules.ai.runtime_execution_gateway import (
    AgentRunExecutionGateway,
    AgentRunExecutionInterrupted,
    AgentRunExecutionOutcome,
    AgentRunExecutionRequest,
    AgentRunResumeExecutionRequest,
)

_OUTCOME_ADAPTER = TypeAdapter(AgentRunExecutionOutcome)


class _AgentRunGraphState(TypedDict, total=False):
    request: JsonObject
    outcome: JsonObject
    resumeInterrupted: JsonObject


class LangGraphAgentRunExecutionGateway:
    """Durably checkpoint one normalized Agent step and its human interrupts."""

    def __init__(
        self,
        *,
        step_gateway: AgentRunExecutionGateway,
        checkpointer_factory: AgentGraphCheckpointerFactory,
    ) -> None:
        self._step_gateway = step_gateway
        self._checkpointer_factory = checkpointer_factory

    async def execute(self, *, request: AgentRunExecutionRequest) -> AgentRunExecutionOutcome:
        thread_id = _thread_id(request)
        async with self._checkpointer_factory() as checkpointer:
            graph = self._compile_graph(checkpointer)
            result = await graph.ainvoke(
                cast(Any, {"request": request.model_dump(mode="json", by_alias=True)}),
                config=_config(thread_id),
            )
            return await _project_graph_result(graph=graph, result=result, thread_id=thread_id)

    async def resume(self, *, request: AgentRunResumeExecutionRequest) -> AgentRunExecutionOutcome:
        thread_id = _thread_id(request)
        resume = {
            "checkpointId": request.checkpoint_id,
            "responseKind": request.response_kind,
            "resume": request.resume,
        }
        async with self._checkpointer_factory() as checkpointer:
            graph = self._compile_graph(checkpointer)
            request_state = request.model_dump(
                mode="json",
                by_alias=True,
                exclude={"checkpoint_id", "response_kind", "resume", "interrupted"},
            )
            update: _AgentRunGraphState = {"request": request_state}
            if request.interrupted is not None:
                update["resumeInterrupted"] = request.interrupted.model_dump(mode="json", by_alias=True)
            result = await graph.ainvoke(
                Command(
                    update=update,
                    resume=resume,
                ),
                config=_config(thread_id),
            )
            return await _project_graph_result(graph=graph, result=result, thread_id=thread_id)

    def _compile_graph(self, checkpointer: BaseCheckpointSaver):
        graph = StateGraph(cast(Any, _AgentRunGraphState))
        graph.add_node("execute", self._execute_step)
        graph.add_node("await_human", self._await_human)
        graph.set_entry_point("execute")
        graph.add_conditional_edges(
            "execute",
            _route_outcome,
            {"interrupted": "await_human", "terminal": END},
        )
        graph.add_conditional_edges(
            "await_human",
            _route_outcome,
            {"interrupted": "await_human", "terminal": END},
        )
        return graph.compile(checkpointer=checkpointer)

    async def _execute_step(self, state: _AgentRunGraphState) -> _AgentRunGraphState:
        request = AgentRunExecutionRequest.model_validate(state["request"])
        outcome = await self._step_gateway.execute(request=request)
        return {"outcome": cast(JsonObject, outcome.model_dump(mode="json", by_alias=True))}

    async def _await_human(self, state: _AgentRunGraphState) -> _AgentRunGraphState:
        outcome = _OUTCOME_ADAPTER.validate_python(state["outcome"])
        if not isinstance(outcome, AgentRunExecutionInterrupted):
            raise RuntimeError("LangGraph await_human requires an interrupted Agent outcome")
        raw_response = interrupt(outcome.model_dump(mode="json", by_alias=True))
        response = _resume_envelope(raw_response)
        persisted_interrupted = state.get("resumeInterrupted")
        if persisted_interrupted is not None:
            interrupted = _OUTCOME_ADAPTER.validate_python(persisted_interrupted)
            if not isinstance(interrupted, AgentRunExecutionInterrupted):
                raise RuntimeError("LangGraph persisted interruption is invalid")
        else:
            interrupted = outcome
        request = AgentRunExecutionRequest.model_validate(state["request"])
        resumed = await self._step_gateway.resume(
            request=AgentRunResumeExecutionRequest(
                **request.model_dump(),
                checkpoint_id=response["checkpointId"],
                response_kind=response["responseKind"],
                resume=response["resume"],
                interrupted=interrupted,
            )
        )
        return {"outcome": cast(JsonObject, resumed.model_dump(mode="json", by_alias=True))}


def _route_outcome(state: _AgentRunGraphState) -> Literal["interrupted", "terminal"]:
    raw_outcome = state.get("outcome")
    if raw_outcome is None:
        raise RuntimeError("LangGraph state is missing its Agent outcome")
    outcome = _OUTCOME_ADAPTER.validate_python(raw_outcome)
    return "interrupted" if isinstance(outcome, AgentRunExecutionInterrupted) else "terminal"


def _thread_id(request: AgentRunExecutionRequest) -> str:
    run_id = request.context.agent_run_id
    if run_id is None:
        raise ValueError("Normalized LangGraph execution requires agent_run_id")
    return f"normalized-agent-run:{run_id}"


def _config(thread_id: str) -> dict[str, JsonObject]:
    return {"configurable": {"thread_id": thread_id}}


async def _project_graph_result(*, graph: Any, result: object, thread_id: str) -> AgentRunExecutionOutcome:
    result_data = cast(dict[str, object], result) if isinstance(result, dict) else None
    if result_data is not None and "__interrupt__" in result_data:
        raw_interrupts = result_data["__interrupt__"]
        interrupted = _interrupt_outcome(raw_interrupts)
        snapshot = await graph.aget_state(_config(thread_id))
        configurable = snapshot.config.get("configurable") if isinstance(snapshot.config, dict) else None
        checkpoint_id = configurable.get("checkpoint_id") if isinstance(configurable, dict) else None
        if not isinstance(checkpoint_id, str) or not checkpoint_id:
            raise RuntimeError("LangGraph interrupted without a durable checkpoint_id")
        approval = interrupted.approval
        if approval is not None:
            approval = approval.model_copy(update={"checkpoint_id": checkpoint_id})
        return interrupted.model_copy(
            update={
                "interrupt_id": _interrupt_id(raw_interrupts),
                "checkpoint_id": checkpoint_id,
                "approval": approval,
            }
        )
    if result_data is None or "outcome" not in result_data:
        raise RuntimeError("LangGraph execution completed without an Agent outcome")
    return _OUTCOME_ADAPTER.validate_python(result_data["outcome"])


def _interrupt_outcome(raw_interrupts: object) -> AgentRunExecutionInterrupted:
    first = _first_interrupt(raw_interrupts)
    value = getattr(first, "value", None)
    return AgentRunExecutionInterrupted.model_validate(value)


def _interrupt_id(raw_interrupts: object) -> str:
    interrupt_id = getattr(_first_interrupt(raw_interrupts), "id", None)
    if not isinstance(interrupt_id, str) or not interrupt_id:
        raise RuntimeError("LangGraph interrupt is missing its stable id")
    return interrupt_id


def _first_interrupt(raw_interrupts: object) -> object:
    interrupts = list(raw_interrupts) if isinstance(raw_interrupts, (list, tuple)) else [raw_interrupts]
    if not interrupts:
        raise RuntimeError("LangGraph interrupt collection is empty")
    return interrupts[0]


def _resume_envelope(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError("LangGraph resume value must be an object")
    data = cast(dict[str, object], value)
    checkpoint_id = data.get("checkpointId")
    response_kind = data.get("responseKind")
    resume = data.get("resume")
    if (
        not isinstance(checkpoint_id, str)
        or response_kind not in {"approval", "human_result"}
        or not isinstance(resume, dict)
    ):
        raise ValueError("LangGraph resume envelope is invalid")
    return cast(dict[str, Any], data)
