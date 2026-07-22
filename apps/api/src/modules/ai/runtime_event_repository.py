from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import AgentRunEventV1Record, AgentRunV1Record
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalProjectionEventV1,
    ApprovalResolvedEventV1,
)
from src.modules.ai.runtime_approval_repository import AgentApprovalProjectionRepository
from src.modules.ai.runtime_delegation_protocol_schema import (
    DelegationProjectionEventV1,
    DelegationTerminalEventV1,
)
from src.modules.ai.runtime_delegation_repository import AgentDelegationProjectionRepository
from src.modules.ai.runtime_message_repository import (
    AgentMessageProjectionRepository,
)
from src.modules.ai.runtime_output_protocol_schema import RunOutputProjectionEventV1
from src.modules.ai.runtime_output_repository import AgentRunOutputProjectionRepository
from src.modules.ai.runtime_protocol_schema import (
    MessagePartCompletedEventV1,
    MessagePartDeltaEventV1,
    MessagePartStartedEventV1,
    RunCreatedEventV1,
)
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_repository_schema import PersistedAgentRunEvent
from src.modules.ai.runtime_run_lifecycle_repository import (
    AgentRunLifecycleRepository,
    RunLifecycleEventV1,
)
from src.modules.ai.runtime_tool_repository import (
    AgentToolProjectionRepository,
    ToolProjectionEventV1,
)
from src.modules.ai.runtime_tool_response_repository import AgentToolResponseRepository
from src.modules.ai.runtime_tool_response_schema import ApprovalToolResponseCommandV1

AppendableAgentRunEventV1 = RunLifecycleEventV1
PersistableAgentRunEventV1 = RunCreatedEventV1 | AppendableAgentRunEventV1


class AgentRunEventRepository(TortoiseORMRepository[AgentRunEventV1Record]):
    def __init__(
        self,
        *,
        message_repository: AgentMessageProjectionRepository | None = None,
        tool_repository: AgentToolProjectionRepository | None = None,
        approval_repository: AgentApprovalProjectionRepository | None = None,
        response_repository: AgentToolResponseRepository | None = None,
        lifecycle_repository: AgentRunLifecycleRepository | None = None,
        delegation_repository: AgentDelegationProjectionRepository | None = None,
        output_repository: AgentRunOutputProjectionRepository | None = None,
    ) -> None:
        super().__init__(AgentRunEventV1Record)
        self._message_repository = message_repository or AgentMessageProjectionRepository()
        self._tool_repository = tool_repository or AgentToolProjectionRepository()
        self._approval_repository = approval_repository or AgentApprovalProjectionRepository()
        self._response_repository = response_repository or AgentToolResponseRepository()
        self._lifecycle_repository = lifecycle_repository or AgentRunLifecycleRepository()
        self._delegation_repository = delegation_repository or AgentDelegationProjectionRepository()
        self._output_repository = output_repository or AgentRunOutputProjectionRepository()

    async def list_after(self, *, run_id: UUID, sequence: int) -> list[PersistedAgentRunEvent]:
        records = await AgentRunEventV1Record.filter(run_id=run_id, sequence__gt=sequence).order_by("sequence")
        return [self._to_persisted(record) for record in records]

    async def append(self, *, event: AppendableAgentRunEventV1) -> PersistedAgentRunEvent:
        if isinstance(event, ApprovalResolvedEventV1) and event.data.approval.status in {"approved", "rejected"}:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_RESPONSE_REQUIRED")
        try:
            run_id = UUID(event.run_id)
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND") from error
        async with in_transaction() as conn:
            return await self.append_in_transaction(event=event, run_id=run_id, conn=conn)

    async def append_in_transaction(
        self,
        *,
        event: AppendableAgentRunEventV1,
        run_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> PersistedAgentRunEvent:
        """Append one normalized event under a caller-owned transaction."""

        run = await self._get_locked_run(run_id=run_id, conn=conn)
        return await self._append_locked(run=run, event=event, conn=conn)

    async def append_approval_response(
        self,
        *,
        command: ApprovalToolResponseCommandV1,
        event: ApprovalResolvedEventV1,
    ) -> tuple[PersistedAgentRunEvent, str]:
        async with in_transaction() as conn:
            run = await self._get_locked_run(run_id=command.run_id, conn=conn)
            self._response_repository.validate_scope(run=run, command=command)
            existing_event = await AgentRunEventV1Record.filter(event_id=event.event_id).using_db(conn).first()
            existing_response = await self._response_repository.get_idempotent(command=command, conn=conn)
            if existing_event is not None or existing_response is not None:
                if existing_event is None or existing_response is None:
                    raise AgentRuntimePersistenceError("AGENT_TOOL_RESPONSE_EVENT_INCONSISTENT")
                self._validate_exact_replay(existing_event, event)
                self._response_repository.validate_exact(existing=existing_response, command=command)
                return self._to_persisted(existing_event), existing_response.response_id
            await self._response_repository.create_approval_response(
                run=run,
                command=command,
                event=event,
                conn=conn,
            )
            persisted = await self._append_locked(run=run, event=event, conn=conn)
            return persisted, command.response_id

    async def append_delegation_projection(
        self,
        *,
        event: DelegationTerminalEventV1,
        source_event_id: str,
    ) -> PersistedAgentRunEvent:
        if not source_event_id or len(source_event_id) > 192:
            raise AgentRuntimePersistenceError("AGENT_DELEGATION_SOURCE_EVENT_INVALID")
        try:
            run_id = UUID(event.run_id)
        except ValueError as error:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND") from error
        async with in_transaction() as conn:
            run = await self._get_locked_run(run_id=run_id, conn=conn)
            existing_source = await AgentRunEventV1Record.filter(source_event_id=source_event_id).using_db(conn).first()
            if existing_source is not None:
                self._validate_exact_replay(existing_source, event)
                return self._to_persisted(existing_source)
            existing_event = await AgentRunEventV1Record.filter(event_id=event.event_id).using_db(conn).first()
            if existing_event is not None:
                raise AgentRuntimePersistenceError("AGENT_DELEGATION_SOURCE_EVENT_MISMATCH")
            return await self._append_locked(
                run=run,
                event=event,
                conn=conn,
                source_event_id=source_event_id,
            )

    async def _append_locked(
        self,
        *,
        run: AgentRunV1Record,
        event: AppendableAgentRunEventV1,
        conn: BaseDBAsyncClient,
        source_event_id: str | None = None,
    ) -> PersistedAgentRunEvent:
        self._validate_owner(run, event)
        existing = await AgentRunEventV1Record.filter(event_id=event.event_id).using_db(conn).first()
        if existing is not None:
            self._validate_exact_replay(existing, event)
            return self._to_persisted(existing)
        if event.sequence != run.last_sequence + 1:
            raise AgentRuntimePersistenceError("AGENT_EVENT_SEQUENCE_INVALID")
        await self._lifecycle_repository.validate_before_append(run=run, event=event, conn=conn)
        await self._project(run=run, event=event, conn=conn)
        record = await self._create_event_record(
            run=run,
            event=event,
            conn=conn,
            source_event_id=source_event_id,
        )
        await self._lifecycle_repository.advance_head(run=run, event=event, conn=conn)
        return self._to_persisted(record)

    async def _project(
        self,
        *,
        run: AgentRunV1Record,
        event: AppendableAgentRunEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if isinstance(
            event,
            (MessagePartStartedEventV1, MessagePartDeltaEventV1, MessagePartCompletedEventV1),
        ):
            await self._message_repository.project(run=run, event=event, conn=conn)
        elif isinstance(event, ToolProjectionEventV1):
            await self._tool_repository.project(run=run, event=event, conn=conn)
        elif isinstance(event, ApprovalProjectionEventV1):
            await self._approval_repository.project(run=run, event=event, conn=conn)
        elif isinstance(event, DelegationProjectionEventV1):
            await self._delegation_repository.project(run=run, event=event, conn=conn)
        elif isinstance(event, RunOutputProjectionEventV1):
            await self._output_repository.project(run=run, event=event, conn=conn)

    async def append_first(
        self,
        *,
        run: AgentRunV1Record,
        event: RunCreatedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        if run.last_sequence != 0 or event.sequence != 1:
            raise AgentRuntimePersistenceError("AGENT_EVENT_SEQUENCE_INVALID")
        await self._create_event_record(run=run, event=event, conn=conn)
        await self._lifecycle_repository.advance_head(run=run, event=event, conn=conn)

    @staticmethod
    async def _get_locked_run(*, run_id: UUID, conn: BaseDBAsyncClient) -> AgentRunV1Record:
        run = await AgentRunV1Record.filter(id=run_id).using_db(conn).select_for_update().first()
        if run is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        return run

    @staticmethod
    def _validate_owner(run: AgentRunV1Record, event: AppendableAgentRunEventV1) -> None:
        if (
            event.run_id != str(run.id)
            or event.thread_id != str(run.thread_id)
            or event.correlation_id != run.correlation_id
        ):
            raise AgentRuntimePersistenceError("AGENT_EVENT_OWNER_MISMATCH")

    @staticmethod
    def _validate_exact_replay(
        existing: AgentRunEventV1Record,
        event: AppendableAgentRunEventV1,
    ) -> None:
        if cast(JsonObject, existing.payload) != event.model_dump(by_alias=True, mode="json"):
            raise AgentRuntimePersistenceError("AGENT_EVENT_ID_REUSED")

    async def _create_event_record(
        self,
        *,
        run: AgentRunV1Record,
        event: PersistableAgentRunEventV1,
        conn: BaseDBAsyncClient,
        source_event_id: str | None = None,
    ) -> AgentRunEventV1Record:
        return await self.create_record(
            AgentRunEventV1Record,
            conn=conn,
            run_id=run.id,
            event_version=event.event_version,
            event_id=event.event_id,
            cursor=event.cursor,
            type=event.type,
            sequence=event.sequence,
            occurred_at=event.occurred_at,
            correlation_id=event.correlation_id,
            span_id=event.span_id,
            parent_span_id=event.parent_span_id,
            source_event_id=source_event_id,
            payload=event.model_dump(by_alias=True, mode="json"),
        )

    @staticmethod
    def _to_persisted(record: AgentRunEventV1Record) -> PersistedAgentRunEvent:
        return PersistedAgentRunEvent(
            event_id=record.event_id,
            sequence=record.sequence,
            cursor=record.cursor,
            payload=cast(JsonObject, record.payload),
        )
