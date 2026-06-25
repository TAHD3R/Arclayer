from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from src.agents.types import AgentRunContext, AgentRunEvent, AgentRunState, AgentRunStatus
from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.run import AgentRunRecord


class AgentRunRepository(TortoiseORMRepository):
    async def create_run(self, state: AgentRunState) -> AgentRunState:
        record = await AgentRunRecord.create(
            id=state.id,
            workspace_id=state.workspace_id,
            project_id=state.project_id,
            user_id=state.user_id,
            agent_id=state.agent_id,
            status=state.status,
            prompt=state.prompt,
            model=state.model,
            result=state.result,
            tool_outputs=dict(state.tool_outputs),
            events=self._serialize_events(state.events),
            cancellation_requested=state.cancellation_requested,
            error_code=state.error_code,
            error_message=state.error_message,
            correlation_id=state.correlation_id,
            runtime_id=state.runtime_id,
            site_id=state.site_id,
            environment_id=state.environment_id,
        )
        return self._to_state(record)

    async def get_run(self, *, run_id: UUID) -> AgentRunState | None:
        record = await AgentRunRecord.filter(id=run_id).first()
        return self._to_state(record) if record is not None else None

    async def get_scoped_run(self, *, run_id: UUID, context: AgentRunContext) -> AgentRunState | None:
        record = await AgentRunRecord.filter(
            id=run_id,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            user_id=context.user_id,
        ).first()
        return self._to_state(record) if record is not None else None

    async def save_state(self, state: AgentRunState) -> AgentRunState:
        record = await AgentRunRecord.filter(id=state.id).first()
        if record is None:
            return await self.create_run(state)

        record.status = state.status
        record.result = state.result
        record.tool_outputs = dict(state.tool_outputs)
        record.events = self._serialize_events(state.events)
        record.cancellation_requested = state.cancellation_requested
        record.error_code = state.error_code
        record.error_message = state.error_message  # ty: ignore[invalid-assignment]
        await record.save(
            update_fields=[
                "status",
                "result",
                "tool_outputs",
                "events",
                "cancellation_requested",
                "error_code",
                "error_message",
                "updated_at",
            ]
        )
        return self._to_state(record)

    @staticmethod
    def _serialize_events(events: list[AgentRunEvent]) -> list[JsonObject]:
        return [cast(JsonObject, event.model_dump(mode="json")) for event in events]

    @staticmethod
    def _to_state(record: AgentRunRecord) -> AgentRunState:
        raw_events = record.events if isinstance(record.events, list) else []
        return AgentRunState(
            id=record.id,
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            user_id=record.user_id,
            agent_id=record.agent_id,
            status=AgentRunStatus(str(record.status)),
            prompt=record.prompt,
            model=record.model,
            result=cast(JsonObject | None, record.result),
            tool_outputs=cast(dict[str, Any], record.tool_outputs or {}),
            events=[AgentRunEvent.model_validate(event) for event in raw_events],
            cancellation_requested=record.cancellation_requested,
            error_code=record.error_code,
            error_message=record.error_message,
            correlation_id=record.correlation_id,
            runtime_id=record.runtime_id,
            site_id=record.site_id,
            environment_id=record.environment_id,
        )
