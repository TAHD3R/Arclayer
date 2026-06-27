from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any, Protocol
from uuid import UUID, uuid4

from src.agents.types import AgentRunContext, AgentRunEvent, AgentRunEventType, AgentRunState, AgentRunStatus
from src.core.exceptions import NotFound
from src.core.i18n import t

LANGGRAPH_CHECKPOINT_NS = "project-agent"
CancellationCallback = Callable[[], Awaitable[None]]


class AgentRunStore(Protocol):
    async def create_run(self, state: AgentRunState) -> AgentRunState: ...

    async def get_run(self, *, run_id: UUID) -> AgentRunState | None: ...

    async def get_scoped_run(self, *, run_id: UUID, context: AgentRunContext) -> AgentRunState | None: ...

    async def save_state(self, state: AgentRunState) -> AgentRunState: ...


class AgentSessionManager:
    def __init__(self, *, store: AgentRunStore | None = None) -> None:
        self._store = store
        self._runs: dict[UUID, AgentRunState] = {}
        self._cancellation_callbacks: dict[UUID, set[CancellationCallback]] = {}

    @asynccontextmanager
    async def cancellation_scope(
        self,
        *,
        run_id: UUID,
        on_cancel: CancellationCallback,
    ) -> AsyncIterator[None]:
        callbacks = self._cancellation_callbacks.setdefault(run_id, set())
        callbacks.add(on_cancel)
        try:
            yield
        finally:
            callbacks.discard(on_cancel)
            if not callbacks:
                self._cancellation_callbacks.pop(run_id, None)

    async def create_run(
        self,
        *,
        context: AgentRunContext,
        agent_id: str,
        prompt: str,
        model: str | None,
    ) -> AgentRunState:
        run_id = uuid4()
        langgraph_thread_id = _langgraph_thread_id(run_id)
        state = AgentRunState(
            id=run_id,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            user_id=context.user_id,
            correlation_id=context.correlation_id,
            agent_id=agent_id,
            status=AgentRunStatus.RUNNING,
            prompt=prompt,
            model=model,
            runtime_id=context.runtime_id,
            site_id=context.site_id,
            environment_id=context.environment_id,
            langgraph_thread_id=langgraph_thread_id,
            langgraph_checkpoint_ns=LANGGRAPH_CHECKPOINT_NS,
            langgraph_checkpoint_id=_langgraph_checkpoint_id(run_id=run_id, node="run.created"),
            langgraph_checkpoint_node="run.created",
            events=[
                AgentRunEvent(
                    event=AgentRunEventType.RUN_CREATED,
                    data={"runId": str(run_id), "agentId": agent_id, "threadId": langgraph_thread_id},
                )
            ],
        )
        return await self._save_state(state, create=True)

    async def get_run(self, *, run_id: UUID, context: AgentRunContext) -> AgentRunState:
        state = await self._get_scoped_state(run_id=run_id, context=context)
        if state is None:
            raise NotFound(message=t("errors", "AGENT_RUN_NOT_FOUND"), error="AGENT_RUN_NOT_FOUND")
        return state

    async def append_event(self, *, run_id: UUID, event: AgentRunEvent) -> AgentRunState:
        state = await self._get_state(run_id)
        next_state = state.model_copy(update={"events": [*state.events, event]})
        return await self._save_state(next_state)

    async def set_tool_outputs(self, *, run_id: UUID, tool_outputs: dict[str, Any]) -> AgentRunState:
        state = await self._get_state(run_id)
        next_state = _with_langgraph_checkpoint(
            state.model_copy(update={"tool_outputs": tool_outputs}),
            node="tools.completed",
        )
        return await self._save_state(next_state)

    async def complete_run(self, *, run_id: UUID, result: dict) -> AgentRunState:
        state = await self._get_state(run_id)
        checkpoint_id = _langgraph_checkpoint_id(run_id=run_id, node="run.completed")
        events = [
            *state.events,
            AgentRunEvent(
                event=AgentRunEventType.RUN_COMPLETED,
                data={"runId": str(run_id), "threadId": state.langgraph_thread_id, "checkpointId": checkpoint_id},
            ),
        ]
        next_state = _with_langgraph_checkpoint(
            state.model_copy(update={"status": AgentRunStatus.COMPLETED, "result": result, "events": events}),
            node="run.completed",
        )
        return await self._save_state(next_state)

    async def interrupt_run(self, *, run_id: UUID, interrupt: dict[str, Any]) -> AgentRunState:
        state = await self._get_state(run_id)
        if AgentRunStatus(str(state.status)) in {
            AgentRunStatus.COMPLETED,
            AgentRunStatus.CANCELLED,
            AgentRunStatus.FAILED,
        }:
            return state
        checkpoint_id = _langgraph_checkpoint_id(run_id=run_id, node="run.interrupted")
        data = {
            **interrupt,
            "runId": str(run_id),
            "threadId": state.langgraph_thread_id,
            "checkpointId": checkpoint_id,
        }
        events = [
            *state.events,
            AgentRunEvent(
                event=AgentRunEventType.APPROVAL_REQUIRED,
                data=data,
            ),
            AgentRunEvent(
                event=AgentRunEventType.RUN_INTERRUPTED,
                data=data,
            ),
        ]
        next_state = _with_langgraph_checkpoint(
            state.model_copy(update={"status": AgentRunStatus.INTERRUPTED, "events": events}),
            node="run.interrupted",
        )
        return await self._save_state(next_state)

    async def resume_run(self, *, run_id: UUID, context: AgentRunContext, resume: dict[str, Any]) -> AgentRunState:
        state = await self.get_run(run_id=run_id, context=context)
        checkpoint_id = _langgraph_checkpoint_id(run_id=run_id, node="run.resumed")
        events = [
            *state.events,
            AgentRunEvent(
                event=AgentRunEventType.RUN_RESUMED,
                data={
                    "runId": str(run_id),
                    "threadId": state.langgraph_thread_id,
                    "checkpointId": checkpoint_id,
                    "resume": resume,
                },
            ),
        ]
        next_state = _with_langgraph_checkpoint(
            state.model_copy(update={"status": AgentRunStatus.RUNNING, "events": events}),
            node="run.resumed",
        )
        return await self._save_state(next_state)

    async def fail_run(self, *, run_id: UUID, code: str, message: str) -> AgentRunState:
        state = await self._get_state(run_id)
        checkpoint_id = _langgraph_checkpoint_id(run_id=run_id, node="run.failed")
        events = [
            *state.events,
            AgentRunEvent(
                event=AgentRunEventType.RUN_FAILED,
                data={
                    "code": code,
                    "message": message,
                    "runId": str(run_id),
                    "threadId": state.langgraph_thread_id,
                    "checkpointId": checkpoint_id,
                },
            ),
        ]
        next_state = _with_langgraph_checkpoint(
            state.model_copy(
                update={
                    "status": AgentRunStatus.FAILED,
                    "error_code": code,
                    "error_message": message,
                    "events": events,
                }
            ),
            node="run.failed",
        )
        return await self._save_state(next_state)

    async def cancel_run(self, *, run_id: UUID, context: AgentRunContext) -> AgentRunState:
        state = await self.get_run(run_id=run_id, context=context)
        if AgentRunStatus(str(state.status)) in {
            AgentRunStatus.COMPLETED,
            AgentRunStatus.CANCELLED,
            AgentRunStatus.FAILED,
        }:
            return state
        await self._release_cancellation_resources(run_id=run_id)
        checkpoint_id = _langgraph_checkpoint_id(run_id=run_id, node="run.cancelled")
        events = [
            *state.events,
            AgentRunEvent(
                event=AgentRunEventType.RUN_CANCELLED,
                data={"runId": str(run_id), "threadId": state.langgraph_thread_id, "checkpointId": checkpoint_id},
            ),
        ]
        next_state = _with_langgraph_checkpoint(
            state.model_copy(
                update={
                    "status": AgentRunStatus.CANCELLED,
                    "cancellation_requested": True,
                    "events": events,
                }
            ),
            node="run.cancelled",
        )
        return await self._save_state(next_state)

    async def _release_cancellation_resources(self, *, run_id: UUID) -> None:
        callbacks = tuple(self._cancellation_callbacks.pop(run_id, set()))
        for callback in callbacks:
            await callback()

    async def is_cancelled(self, *, run_id: UUID) -> bool:
        state = await self._get_state_or_none(run_id)
        return bool(state is not None and state.cancellation_requested)

    async def _get_state(self, run_id: UUID) -> AgentRunState:
        state = await self._get_state_or_none(run_id)
        if state is None:
            raise KeyError(run_id)
        return state

    async def _get_state_or_none(self, run_id: UUID) -> AgentRunState | None:
        if self._store is not None:
            return await self._store.get_run(run_id=run_id)
        return self._runs.get(run_id)

    async def _get_scoped_state(self, *, run_id: UUID, context: AgentRunContext) -> AgentRunState | None:
        if self._store is not None:
            return await self._store.get_scoped_run(run_id=run_id, context=context)
        state = self._runs.get(run_id)
        if (
            state is None
            or state.workspace_id != context.workspace_id
            or state.project_id != context.project_id
            or state.user_id != context.user_id
        ):
            return None
        return state

    async def _save_state(self, state: AgentRunState, *, create: bool = False) -> AgentRunState:
        if self._store is not None:
            return await self._store.create_run(state) if create else await self._store.save_state(state)
        self._runs[state.id] = state
        return state


def _langgraph_thread_id(run_id: UUID) -> str:
    return f"agent-run:{run_id}"


def _langgraph_checkpoint_id(*, run_id: UUID, node: str) -> str:
    return f"{run_id}:{node}"


def _with_langgraph_checkpoint(state: AgentRunState, *, node: str) -> AgentRunState:
    return state.model_copy(
        update={
            "langgraph_checkpoint_ns": state.langgraph_checkpoint_ns or LANGGRAPH_CHECKPOINT_NS,
            "langgraph_checkpoint_id": _langgraph_checkpoint_id(run_id=state.id, node=node),
            "langgraph_checkpoint_node": node,
        }
    )
