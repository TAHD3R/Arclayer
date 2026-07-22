from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_delegation_v1 import AgentDelegationV1Record
from src.models.agents.runtime_v1 import (
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunV1Record,
)
from src.modules.ai.runtime_protocol_schema import (
    DelegationMessagePlacementV1,
    MessagePartCompletedEventV1,
    MessagePartDeltaEventV1,
    MessagePartStartedEventV1,
    ProjectedMessageShellV1,
    TextMessagePartCompletedV1,
    TextMessagePartStartedV1,
    ToolCallMessagePartFailedV1,
    ToolCallMessagePartStartedV1,
    ToolCallMessagePartTerminalV1,
)
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError

MessageProjectionEventV1 = MessagePartStartedEventV1 | MessagePartDeltaEventV1 | MessagePartCompletedEventV1
TERMINAL_PART_STATUSES = ("complete", "incomplete", "failed")


class AgentMessageProjectionRepository(TortoiseORMRepository[AgentMessageV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentMessageV1Record)

    async def project(
        self,
        *,
        run: AgentRunV1Record,
        event: MessageProjectionEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if isinstance(event, MessagePartStartedEventV1):
            await self._start_part(run=run, event=event, conn=conn)
        elif isinstance(event, MessagePartDeltaEventV1):
            await self._append_text_delta(run=run, event=event, conn=conn)
        else:
            await self._complete_part(run=run, event=event, conn=conn)

    async def _start_part(
        self,
        *,
        run: AgentRunV1Record,
        event: MessagePartStartedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        shell = event.data.message
        part = event.data.part
        message_id = self._parse_uuid(shell.message_id)
        part_id = self._parse_uuid(part.part_id)
        message = await AgentMessageV1Record.filter(id=message_id).using_db(conn).first()
        if message is None:
            message = await self._create_message(run=run, shell=shell, message_id=message_id, conn=conn)
        else:
            self._validate_message_identity(message=message, run=run, shell=shell)
            message.status = "running"
            await message.save(update_fields=["status", "updated_at"], using_db=conn)
        part_count = await AgentMessagePartV1Record.filter(message_id=message.id).using_db(conn).count()
        if part.part_index != part_count or await AgentMessagePartV1Record.filter(id=part_id).using_db(conn).exists():
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_PART_IDENTITY_INVALID")
        await self.create_record(
            AgentMessagePartV1Record,
            conn=conn,
            id=part_id,
            message_id=message.id,
            part_index=part.part_index,
            type=part.type,
            status=part.status,
            text=part.text if isinstance(part, TextMessagePartStartedV1) else None,
            tool_call_id=(part.tool_call_id if isinstance(part, ToolCallMessagePartStartedV1) else None),
            payload=part.model_dump(by_alias=True, mode="json"),
        )

    async def _append_text_delta(
        self,
        *,
        run: AgentRunV1Record,
        event: MessagePartDeltaEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        message, part = await self._get_locked_part(
            run=run,
            message_id=self._parse_uuid(event.data.message_id),
            part_id=self._parse_uuid(event.data.part_id),
            conn=conn,
        )
        if part.type != "text" or part.status != "running" or part.text is None:
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_PART_DELTA_INVALID")
        text = part.text + event.data.delta.text
        part.text = text
        part.payload = cast(JsonObject, {**cast(JsonObject, part.payload), "text": text})
        await part.save(update_fields=["text", "payload", "updated_at"], using_db=conn)
        if message.status != "running":
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_STATUS_INVALID")

    async def _complete_part(
        self,
        *,
        run: AgentRunV1Record,
        event: MessagePartCompletedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        snapshot = event.data.part
        message, part = await self._get_locked_part(
            run=run,
            message_id=self._parse_uuid(event.data.message_id),
            part_id=self._parse_uuid(snapshot.part_id),
            conn=conn,
        )
        if part.status != "running" or part.part_index != snapshot.part_index or part.type != snapshot.type:
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_PART_INTEGRITY_MISMATCH")
        if isinstance(snapshot, TextMessagePartCompletedV1):
            if part.text != snapshot.text:
                raise AgentRuntimePersistenceError("AGENT_MESSAGE_PART_INTEGRITY_MISMATCH")
        else:
            self._validate_tool_completion(part=part, snapshot=snapshot)
        part.status = snapshot.status
        part.payload = snapshot.model_dump(by_alias=True, mode="json")
        await part.save(update_fields=["status", "payload", "updated_at"], using_db=conn)
        message.status = await self._message_status(message_id=message.id, conn=conn)
        await message.save(update_fields=["status", "updated_at"], using_db=conn)

    @staticmethod
    def _validate_tool_completion(
        *,
        part: AgentMessagePartV1Record,
        snapshot: ToolCallMessagePartTerminalV1,
    ) -> None:
        current = cast(JsonObject, part.payload)
        if "completedAt" not in current and "failedAt" not in current:
            raise AgentRuntimePersistenceError("AGENT_TOOL_OUTCOME_MISSING")
        if "failedAt" in current and not isinstance(snapshot, ToolCallMessagePartFailedV1):
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_PART_INTEGRITY_MISMATCH")
        ignored = {"status", "toolId", "toolVersion", "startedAt", "progress", "completedAt", "failedAt"}
        expected = {key: value for key, value in current.items() if key not in ignored}
        serialized = snapshot.model_dump(by_alias=True, mode="json")
        actual = {key: value for key, value in serialized.items() if key != "status"}
        if actual != expected:
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_PART_INTEGRITY_MISMATCH")

    async def _create_message(
        self,
        *,
        run: AgentRunV1Record,
        shell: ProjectedMessageShellV1,
        message_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentMessageV1Record:
        placement = shell.placement
        delegation_fields: dict[str, str | None] = {
            "delegation_id": None,
            "parent_tool_call_id": None,
            "source_run_id": None,
        }
        if isinstance(placement, DelegationMessagePlacementV1):
            await self._validate_delegation_placement(run=run, placement=placement, conn=conn)
            delegation_fields = {
                "delegation_id": placement.delegation_id,
                "parent_tool_call_id": placement.parent_tool_call_id,
                "source_run_id": placement.source_run_id,
            }
        return await self.create_record(
            AgentMessageV1Record,
            conn=conn,
            id=message_id,
            thread_id=run.thread_id,
            run_id=run.id,
            role=shell.role,
            status="running",
            agent_id=shell.agent_id,
            actor_user_id=(self._parse_uuid(shell.actor_user_id) if shell.actor_user_id is not None else None),
            placement_kind=placement.kind,
            created_at=shell.created_at,
            **delegation_fields,
        )

    @staticmethod
    async def _validate_delegation_placement(
        *,
        run: AgentRunV1Record,
        placement: DelegationMessagePlacementV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        delegation = await (
            AgentDelegationV1Record
            .filter(
                delegation_id=placement.delegation_id,
                parent_run_id=run.id,
                parent_tool_call_id=placement.parent_tool_call_id,
            )
            .using_db(conn)
            .first()
        )
        if delegation is None or str(delegation.child_run_id) != placement.source_run_id:
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_DELEGATION_INVALID")

    @staticmethod
    def _validate_message_identity(
        *,
        message: AgentMessageV1Record,
        run: AgentRunV1Record,
        shell: ProjectedMessageShellV1,
    ) -> None:
        placement = shell.placement
        delegation_id = placement.delegation_id if isinstance(placement, DelegationMessagePlacementV1) else None
        parent_tool_call_id = (
            placement.parent_tool_call_id if isinstance(placement, DelegationMessagePlacementV1) else None
        )
        source_run_id = placement.source_run_id if isinstance(placement, DelegationMessagePlacementV1) else None
        if (
            message.run_id != run.id
            or message.thread_id != run.thread_id
            or message.role != shell.role
            or message.agent_id != shell.agent_id
            or (str(message.actor_user_id) if message.actor_user_id is not None else None) != shell.actor_user_id
            or message.created_at != shell.created_at
            or message.placement_kind != placement.kind
            or message.delegation_id != delegation_id
            or message.parent_tool_call_id != parent_tool_call_id
            or message.source_run_id != source_run_id
        ):
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_IDENTITY_INVALID")

    @staticmethod
    async def _get_locked_part(
        *,
        run: AgentRunV1Record,
        message_id: UUID,
        part_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentMessageV1Record, AgentMessagePartV1Record]:
        message = await AgentMessageV1Record.filter(id=message_id, run_id=run.id).using_db(conn).first()
        part = await (
            AgentMessagePartV1Record
            .filter(id=part_id, message_id=message_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if message is None or part is None:
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_PART_NOT_FOUND")
        return message, part

    @staticmethod
    async def _message_status(*, message_id: UUID, conn: BaseDBAsyncClient) -> str:
        parts = await AgentMessagePartV1Record.filter(message_id=message_id).using_db(conn).all()
        statuses = {part.status for part in parts}
        if statuses - set(TERMINAL_PART_STATUSES):
            return "running"
        if "failed" in statuses:
            return "failed"
        if "incomplete" in statuses:
            return "incomplete"
        return "complete"

    @staticmethod
    def _parse_uuid(value: str) -> UUID:
        try:
            return UUID(value)
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_MESSAGE_IDENTIFIER_INVALID") from error
