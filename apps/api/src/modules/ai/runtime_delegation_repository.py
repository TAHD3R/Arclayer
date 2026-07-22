from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_delegation_v1 import AgentDelegationStatusV1, AgentDelegationV1Record
from src.models.agents.runtime_v1 import (
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
)
from src.modules.ai.runtime_delegation_protocol_schema import (
    DelegationCompletedEventV1,
    DelegationDelegatedEventV1,
    DelegationFailedEventV1,
    DelegationProjectionEventV1,
)
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError


class AgentDelegationProjectionRepository(TortoiseORMRepository[AgentDelegationV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentDelegationV1Record)

    async def project(
        self,
        *,
        run: AgentRunV1Record,
        event: DelegationProjectionEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if isinstance(event, DelegationDelegatedEventV1):
            await self._delegate(run=run, event=event, conn=conn)
        elif isinstance(event, DelegationCompletedEventV1):
            await self._complete(run=run, event=event, conn=conn)
        else:
            await self._fail(run=run, event=event, conn=conn)

    async def _delegate(
        self,
        *,
        run: AgentRunV1Record,
        event: DelegationDelegatedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        child_run_id = self._parse_uuid(event.data.child_run_id)
        child = await AgentRunV1Record.filter(id=child_run_id).using_db(conn).select_for_update().first()
        if (
            child is None
            or child.id == run.id
            or child.workspace_id != run.workspace_id
            or child.project_id != run.project_id
            or child.thread_id != run.thread_id
            or child.owner_user_id != run.owner_user_id
            or child.correlation_id != run.correlation_id
            or child.status in {AgentRunStatusV1.COMPLETED, AgentRunStatusV1.CANCELLED, AgentRunStatusV1.FAILED}
        ):
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_CHILD_RUN_INVALID")
        part = await self._get_parent_part(run=run, tool_call_id=event.data.parent_tool_call_id, conn=conn)
        payload = cast(JsonObject, part.payload)
        if part.status != "running" or payload.get("toolName") != "agent.delegate":
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_PARENT_TOOL_INVALID")
        await self.create_record(
            AgentDelegationV1Record,
            conn=conn,
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            thread_id=run.thread_id,
            parent_run_id=run.id,
            child_run_id=child.id,
            parent_message_part_id=part.id,
            owner_user_id=run.owner_user_id,
            delegation_id=event.data.delegation_id,
            parent_tool_call_id=event.data.parent_tool_call_id,
            source_agent_version_id=event.data.source_agent_version_id,
            target_agent_version_id=event.data.target_agent_version_id,
            status=AgentDelegationStatusV1.DELEGATED,
            delegated_at=event.data.delegated_at,
            objective_summary=event.data.objective_summary,
        )

    async def _complete(
        self,
        *,
        run: AgentRunV1Record,
        event: DelegationCompletedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        delegation, child = await self._get_active_delegation(run=run, event=event, conn=conn)
        if child.status != AgentRunStatusV1.COMPLETED:
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_CHILD_NOT_TERMINAL")
        delegation.status = AgentDelegationStatusV1.COMPLETED
        delegation.completed_at = event.data.completed_at
        delegation.summary = event.data.summary
        delegation.artifact_refs = [item.model_dump(by_alias=True, mode="json") for item in event.data.artifact_refs]
        await delegation.save(
            update_fields=["status", "completed_at", "summary", "artifact_refs", "updated_at"],
            using_db=conn,
        )

    async def _fail(
        self,
        *,
        run: AgentRunV1Record,
        event: DelegationFailedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        delegation, child = await self._get_active_delegation(run=run, event=event, conn=conn)
        if child.status not in {AgentRunStatusV1.FAILED, AgentRunStatusV1.CANCELLED}:
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_CHILD_NOT_TERMINAL")
        delegation.status = AgentDelegationStatusV1.FAILED
        delegation.failed_at = event.data.failed_at
        delegation.error = cast(JsonValue, event.data.error.model_dump(by_alias=True, mode="json"))
        await delegation.save(
            update_fields=["status", "failed_at", "error", "updated_at"],
            using_db=conn,
        )

    @staticmethod
    async def _get_active_delegation(
        *,
        run: AgentRunV1Record,
        event: DelegationCompletedEventV1 | DelegationFailedEventV1,
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentDelegationV1Record, AgentRunV1Record]:
        try:
            child_run_id = UUID(event.data.child_run_id)
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_CHILD_RUN_INVALID") from error
        delegation = await (
            AgentDelegationV1Record
            .filter(
                delegation_id=event.data.delegation_id,
                parent_run_id=run.id,
                child_run_id=child_run_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        child = await AgentRunV1Record.filter(id=child_run_id).using_db(conn).select_for_update().first()
        if delegation is None or child is None:
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_NOT_FOUND")
        if delegation.status != AgentDelegationStatusV1.DELEGATED:
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_ALREADY_TERMINAL")
        return delegation, child

    @staticmethod
    async def _get_parent_part(
        *,
        run: AgentRunV1Record,
        tool_call_id: str,
        conn: BaseDBAsyncClient,
    ) -> AgentMessagePartV1Record:
        part = (
            await AgentMessagePartV1Record.filter(tool_call_id=tool_call_id).using_db(conn).select_for_update().first()
        )
        if part is None:
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_PARENT_TOOL_INVALID")
        message_exists = await AgentMessageV1Record.filter(id=part.message_id, run_id=run.id).using_db(conn).exists()
        if not message_exists:
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_PARENT_TOOL_INVALID")
        return part

    @staticmethod
    def _parse_uuid(value: str) -> UUID:
        try:
            return UUID(value)
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_CHILD_RUN_INVALID") from error
