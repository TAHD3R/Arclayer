from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import AgentMessagePartV1Record, AgentMessageV1Record, AgentRunV1Record
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_tool_protocol_schema import (
    ToolCompletedEventV1,
    ToolFailedEventV1,
    ToolProgressEventV1,
    ToolStartedEventV1,
)

ToolProjectionEventV1 = ToolStartedEventV1 | ToolProgressEventV1 | ToolCompletedEventV1 | ToolFailedEventV1


class AgentToolProjectionRepository(TortoiseORMRepository[AgentMessagePartV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentMessagePartV1Record)

    async def project(
        self,
        *,
        run: AgentRunV1Record,
        event: ToolProjectionEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if isinstance(event, ToolStartedEventV1):
            await self._start(run=run, event=event, conn=conn)
        elif isinstance(event, ToolProgressEventV1):
            await self._progress(run=run, event=event, conn=conn)
        elif isinstance(event, ToolCompletedEventV1):
            await self._complete(run=run, event=event, conn=conn)
        else:
            await self._fail(run=run, event=event, conn=conn)

    async def _start(
        self,
        *,
        run: AgentRunV1Record,
        event: ToolStartedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        message_id = self._parse_uuid(event.data.message_id)
        part_id = self._parse_uuid(event.data.part_id)
        _, part = await self._get_locked_part(
            run=run,
            tool_call_id=event.data.tool_call_id,
            conn=conn,
            message_id=message_id,
            part_id=part_id,
        )
        payload = cast(JsonObject, part.payload)
        if (
            part.type != "tool-call"
            or part.status != "running"
            or payload.get("toolCallId") != event.data.tool_call_id
            or payload.get("toolName") != event.data.tool_name
            or payload.get("args") != event.data.args
            or payload.get("argsText") != event.data.args_text
            or "startedAt" in payload
        ):
            raise AgentRuntimePersistenceError("AGENT_TOOL_IDENTITY_MISMATCH")
        self._merge_payload(
            part,
            {
                "toolId": event.data.tool_id,
                "toolVersion": event.data.tool_version,
                "startedAt": event.data.started_at.isoformat().replace("+00:00", "Z"),
            },
        )
        await part.save(update_fields=["payload", "updated_at"], using_db=conn)

    async def _progress(
        self,
        *,
        run: AgentRunV1Record,
        event: ToolProgressEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        _, part = await self._get_locked_part(
            run=run,
            tool_call_id=event.data.tool_call_id,
            conn=conn,
        )
        self._require_active_started_tool(part)
        self._merge_payload(
            part,
            {"progress": event.data.progress.model_dump(by_alias=True, mode="json")},
        )
        await part.save(update_fields=["payload", "updated_at"], using_db=conn)

    async def _complete(
        self,
        *,
        run: AgentRunV1Record,
        event: ToolCompletedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        _, part = await self._get_locked_part(
            run=run,
            tool_call_id=event.data.tool_call_id,
            conn=conn,
        )
        self._require_active_started_tool(part)
        data = event.data.model_dump(by_alias=True, mode="json")
        data.pop("toolCallId")
        self._merge_payload(part, cast(JsonObject, data))
        await part.save(update_fields=["payload", "updated_at"], using_db=conn)

    async def _fail(
        self,
        *,
        run: AgentRunV1Record,
        event: ToolFailedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        _, part = await self._get_locked_part(
            run=run,
            tool_call_id=event.data.tool_call_id,
            conn=conn,
        )
        self._require_active_started_tool(part)
        self._merge_payload(
            part,
            {
                "failedAt": event.data.failed_at.isoformat().replace("+00:00", "Z"),
                "error": cast(JsonValue, event.data.error.model_dump(by_alias=True, mode="json")),
            },
        )
        await part.save(update_fields=["payload", "updated_at"], using_db=conn)

    @staticmethod
    async def _get_locked_part(
        *,
        run: AgentRunV1Record,
        tool_call_id: str,
        conn: BaseDBAsyncClient,
        message_id: UUID | None = None,
        part_id: UUID | None = None,
    ) -> tuple[AgentMessageV1Record, AgentMessagePartV1Record]:
        filters: dict[str, object] = {"tool_call_id": tool_call_id}
        if part_id is not None:
            filters["id"] = part_id
        if message_id is not None:
            filters["message_id"] = message_id
        part = await AgentMessagePartV1Record.filter(**filters).using_db(conn).select_for_update().first()
        if part is None:
            raise AgentRuntimePersistenceError("AGENT_TOOL_PART_NOT_FOUND")
        message = await AgentMessageV1Record.filter(id=part.message_id, run_id=run.id).using_db(conn).first()
        if message is None:
            raise AgentRuntimePersistenceError("AGENT_TOOL_PART_NOT_FOUND")
        return message, part

    @staticmethod
    def _require_active_started_tool(part: AgentMessagePartV1Record) -> None:
        payload = cast(JsonObject, part.payload)
        if (
            part.type != "tool-call"
            or part.status != "running"
            or "startedAt" not in payload
            or "completedAt" in payload
            or "failedAt" in payload
        ):
            raise AgentRuntimePersistenceError("AGENT_TOOL_TRANSITION_INVALID")

    @staticmethod
    def _merge_payload(part: AgentMessagePartV1Record, update: JsonObject) -> None:
        part.payload = {**cast(JsonObject, part.payload), **update}

    @staticmethod
    def _parse_uuid(value: str) -> UUID:
        try:
            return UUID(value)
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_IDENTIFIER_INVALID") from error
