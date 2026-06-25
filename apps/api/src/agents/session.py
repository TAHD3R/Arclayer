from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID, uuid4

from src.agents.types import AgentRunContext, AgentRunEvent, AgentRunEventType, AgentRunState, AgentRunStatus
from src.core.exceptions import NotFound
from src.core.i18n import t


class AgentRunStore(Protocol):
    async def create_run(self, state: AgentRunState) -> AgentRunState: ...

    async def get_run(self, *, run_id: UUID) -> AgentRunState | None: ...

    async def get_scoped_run(self, *, run_id: UUID, context: AgentRunContext) -> AgentRunState | None: ...

    async def save_state(self, state: AgentRunState) -> AgentRunState: ...


class AgentSessionManager:
    def __init__(self, *, store: AgentRunStore | None = None) -> None:
        self._store = store
        self._runs: dict[UUID, AgentRunState] = {}

    async def create_run(
        self,
        *,
        context: AgentRunContext,
        agent_id: str,
        prompt: str,
        model: str | None,
    ) -> AgentRunState:
        run_id = uuid4()
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
            events=[
                AgentRunEvent(
                    event=AgentRunEventType.RUN_CREATED,
                    data={"runId": str(run_id), "agentId": agent_id},
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
        next_state = state.model_copy(update={"tool_outputs": tool_outputs})
        return await self._save_state(next_state)

    async def complete_run(self, *, run_id: UUID, result: dict) -> AgentRunState:
        state = await self._get_state(run_id)
        events = [
            *state.events,
            AgentRunEvent(event=AgentRunEventType.RUN_COMPLETED, data={"runId": str(run_id)}),
        ]
        next_state = state.model_copy(update={"status": AgentRunStatus.COMPLETED, "result": result, "events": events})
        return await self._save_state(next_state)

    async def fail_run(self, *, run_id: UUID, code: str, message: str) -> AgentRunState:
        state = await self._get_state(run_id)
        events = [
            *state.events,
            AgentRunEvent(event=AgentRunEventType.RUN_FAILED, data={"code": code, "message": message}),
        ]
        next_state = state.model_copy(
            update={
                "status": AgentRunStatus.FAILED,
                "error_code": code,
                "error_message": message,
                "events": events,
            }
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
        events = [
            *state.events,
            AgentRunEvent(event=AgentRunEventType.RUN_CANCELLED, data={"runId": str(run_id)}),
        ]
        next_state = state.model_copy(
            update={
                "status": AgentRunStatus.CANCELLED,
                "cancellation_requested": True,
                "events": events,
            }
        )
        return await self._save_state(next_state)

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
