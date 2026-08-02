from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_builder_v1 import AgentRunBuilderSnapshotV1Record
from src.models.agents.runtime_design_system_v1 import AgentRunDesignSystemSnapshotV1Record
from src.models.agents.runtime_knowledge_v1 import (
    AgentRunKnowledgeSnapshotV1Record,
    AgentRunKnowledgeSourceSnapshotV1Record,
)
from src.models.agents.runtime_skill_v1 import AgentRunSkillSnapshotV1Record
from src.models.agents.runtime_v1 import (
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
)
from src.modules.ai.runtime_approval_protocol_schema import ApprovalResolvedEventV1
from src.modules.ai.runtime_delegation_protocol_schema import DelegationTerminalEventV1
from src.modules.ai.runtime_event_repository import (
    AgentRunEventRepository,
    AppendableAgentRunEventV1,
)
from src.modules.ai.runtime_protocol_schema import RunCreatedEventV1
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_repository_schema import (
    AgentRunCreatePersistenceCommand,
    PersistedAgentMessage,
    PersistedAgentMessagePart,
    PersistedAgentRunEvent,
    PersistedAgentRunHead,
)
from src.modules.ai.runtime_snapshot_repository import AgentRunSnapshotRepository
from src.modules.ai.runtime_snapshot_schema import AgentRunSnapshotScopeV1, AgentRunSnapshotV1
from src.modules.ai.runtime_tool_response_repository import AgentToolResponseRepository
from src.modules.ai.runtime_tool_response_schema import (
    ApprovalToolResponseCommandV1,
    HumanToolResultResponseCommandV1,
    PersistedAgentToolResponseV1,
)


class AgentRuntimeRepository(TortoiseORMRepository[AgentRunV1Record]):
    def __init__(
        self,
        *,
        event_repository: AgentRunEventRepository | None = None,
        response_repository: AgentToolResponseRepository | None = None,
        snapshot_repository: AgentRunSnapshotRepository | None = None,
    ) -> None:
        super().__init__(AgentRunV1Record)
        self._response_repository = response_repository or AgentToolResponseRepository()
        self._event_repository = event_repository or AgentRunEventRepository(
            response_repository=self._response_repository
        )
        self._snapshot_repository = snapshot_repository or AgentRunSnapshotRepository()

    async def create_run_with_first_event(
        self,
        *,
        command: AgentRunCreatePersistenceCommand,
        event: RunCreatedEventV1,
    ) -> PersistedAgentRunHead:
        self._validate_create_contract(command, event)
        async with in_transaction() as conn:
            return await self.create_run_with_first_event_in_transaction(
                command=command,
                event=event,
                conn=conn,
            )

    async def create_run_with_first_event_in_transaction(
        self,
        *,
        command: AgentRunCreatePersistenceCommand,
        event: RunCreatedEventV1,
        conn: BaseDBAsyncClient,
    ) -> PersistedAgentRunHead:
        """Create or replay a Run graph inside the caller's Job/outbox transaction."""

        self._validate_create_contract(command, event)
        thread = await self._get_locked_thread(command, conn)
        existing = await self._get_idempotent_run(command, conn)
        if existing is not None:
            self._validate_idempotent_run(existing, command)
            await self._validate_idempotent_skill_snapshots(
                run_id=existing.id,
                command=command,
                conn=conn,
            )
            await self._validate_idempotent_knowledge_snapshot(
                run_id=existing.id,
                command=command,
                conn=conn,
            )
            await self._validate_idempotent_design_system_snapshot(
                run_id=existing.id,
                command=command,
                conn=conn,
            )
            await self._validate_idempotent_builder_snapshot(
                run_id=existing.id,
                command=command,
                conn=conn,
            )
            return self.to_head(existing)
        return await self._create_run_graph(thread=thread, command=command, event=event, conn=conn)

    @staticmethod
    async def prepare_run_create_in_transaction(
        *,
        workspace_id: UUID,
        thread_id: UUID,
        owner_user_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentThreadV1Record, AgentRunV1Record | None]:
        """Lock the owned Thread and discover a replay before generating a Run ID."""

        thread = await (
            AgentThreadV1Record
            .filter(
                id=thread_id,
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                deleted_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if thread is None:
            raise AgentRuntimePersistenceError("AGENT_THREAD_NOT_FOUND")
        existing = await (
            AgentRunV1Record
            .filter(
                thread_id=thread_id,
                owner_user_id=owner_user_id,
                idempotency_key=idempotency_key,
            )
            .using_db(conn)
            .first()
        )
        return thread, existing

    async def list_events_after(self, *, run_id: UUID, sequence: int) -> list[PersistedAgentRunEvent]:
        return await self._event_repository.list_after(run_id=run_id, sequence=sequence)

    async def get_snapshot(self, *, scope: AgentRunSnapshotScopeV1) -> AgentRunSnapshotV1:
        return await self._snapshot_repository.get(scope=scope)

    async def append_event(self, *, event: AppendableAgentRunEventV1) -> PersistedAgentRunEvent:
        return await self._event_repository.append(event=event)

    async def append_events_atomically(
        self,
        *,
        run_id: UUID,
        events: tuple[AppendableAgentRunEventV1, ...],
    ) -> tuple[PersistedAgentRunEvent, ...]:
        async with in_transaction() as conn:
            persisted: list[PersistedAgentRunEvent] = []
            for event in events:
                persisted.append(
                    await self._event_repository.append_in_transaction(
                        event=event,
                        run_id=run_id,
                        conn=conn,
                    )
                )
            return tuple(persisted)

    async def append_event_in_transaction(
        self,
        *,
        event: AppendableAgentRunEventV1,
        run_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> PersistedAgentRunEvent:
        return await self._event_repository.append_in_transaction(
            event=event,
            run_id=run_id,
            conn=conn,
        )

    async def append_approval_response(
        self,
        *,
        command: ApprovalToolResponseCommandV1,
        event: ApprovalResolvedEventV1,
    ) -> tuple[PersistedAgentRunEvent, str]:
        return await self._event_repository.append_approval_response(command=command, event=event)

    async def record_human_tool_result(
        self,
        *,
        command: HumanToolResultResponseCommandV1,
    ) -> PersistedAgentToolResponseV1:
        return await self._response_repository.record_human_result(command=command)

    async def append_delegation_projection(
        self,
        *,
        event: DelegationTerminalEventV1,
        source_event_id: str,
    ) -> PersistedAgentRunEvent:
        return await self._event_repository.append_delegation_projection(
            event=event,
            source_event_id=source_event_id,
        )

    async def list_messages(self, *, thread_id: UUID) -> list[PersistedAgentMessage]:
        messages = await AgentMessageV1Record.filter(thread_id=thread_id).order_by("created_at", "id")
        parts = await AgentMessagePartV1Record.filter(message_id__in=[item.id for item in messages]).order_by(
            "message_id", "part_index"
        )
        parts_by_message: dict[UUID, list[PersistedAgentMessagePart]] = {}
        for part in parts:
            parts_by_message.setdefault(part.message_id, []).append(
                PersistedAgentMessagePart(type=part.type, status=part.status, text=part.text)
            )
        return [
            PersistedAgentMessage(
                id=message.id,
                role=message.role,
                status=message.status,
                parts=tuple(parts_by_message.get(message.id, [])),
            )
            for message in messages
        ]

    @staticmethod
    def _validate_create_contract(
        command: AgentRunCreatePersistenceCommand,
        event: RunCreatedEventV1,
    ) -> None:
        if (
            event.sequence != 1
            or event.run_id != str(command.run_id)
            or event.thread_id != str(command.thread_id)
            or event.correlation_id != command.correlation_id
            or event.data.run.lead_agent_id != str(command.lead_agent_id)
            or event.data.run.execution_mode != command.execution_mode
            or (command.project_id is None) != (command.design_system_context is None)
            or (
                command.design_system_context is not None
                and command.design_system_context.context.project_id != command.project_id
            )
            or (
                command.knowledge_context is not None
                and (
                    command.knowledge_context.context.workspace_id != command.workspace_id
                    or command.knowledge_context.context.project_id != command.project_id
                )
            )
        ):
            raise AgentRuntimePersistenceError("AGENT_RUN_CREATE_CONTRACT_MISMATCH")
        assignments = (command.lead_agent_assignment_id, *command.mentioned_agent_assignment_ids)
        versions = (command.lead_agent_version_id, *command.mentioned_agent_version_ids)
        expected_order = tuple(
            (agent_order, skill_order)
            for agent_order in range(len(assignments))
            for skill_order in range(sum(1 for item in command.skill_grants if item.agent_order == agent_order))
        )
        actual_order = tuple((item.agent_order, item.skill_order) for item in command.skill_grants)
        if expected_order != actual_order or any(
            item.agent_order >= len(assignments)
            or item.agent_assignment_id != assignments[item.agent_order]
            or item.agent_version_id != versions[item.agent_order]
            for item in command.skill_grants
        ):
            raise AgentRuntimePersistenceError("AGENT_SKILL_SNAPSHOT_INVALID")
        knowledge = command.knowledge_context
        if knowledge is not None and tuple(item.source_order for item in knowledge.sources) != tuple(
            range(len(knowledge.sources))
        ):
            raise AgentRuntimePersistenceError("AGENT_KNOWLEDGE_SNAPSHOT_INVALID")

    @staticmethod
    async def _get_locked_thread(
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> AgentThreadV1Record:
        thread = await (
            AgentThreadV1Record
            .filter(
                id=command.thread_id,
                workspace_id=command.workspace_id,
                project_id=command.project_id,
                owner_user_id=command.owner_user_id,
                lead_agent_id=str(command.lead_agent_id),
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if thread is None:
            raise AgentRuntimePersistenceError("AGENT_THREAD_NOT_FOUND")
        return thread

    @staticmethod
    async def _get_idempotent_run(
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> AgentRunV1Record | None:
        return await (
            AgentRunV1Record
            .filter(
                thread_id=command.thread_id,
                owner_user_id=command.owner_user_id,
                idempotency_key=command.idempotency_key,
            )
            .using_db(conn)
            .first()
        )

    @staticmethod
    def _validate_idempotent_run(
        existing: AgentRunV1Record,
        command: AgentRunCreatePersistenceCommand,
    ) -> None:
        if (
            existing.id != command.run_id
            or existing.workspace_id != command.workspace_id
            or existing.project_id != command.project_id
            or existing.job_id != command.job_id
            or existing.lead_agent_id != str(command.lead_agent_id)
            or existing.lead_agent_version_id != command.lead_agent_version_id
            or existing.lead_agent_assignment_id != command.lead_agent_assignment_id
            or existing.execution_mode != command.execution_mode
            or tuple(existing.mentioned_agent_ids) != tuple(str(value) for value in command.mentioned_agent_ids)
            or tuple(existing.mentioned_agent_version_ids)
            != tuple(str(value) for value in command.mentioned_agent_version_ids)
            or tuple(existing.mentioned_agent_assignment_ids)
            != tuple(str(value) for value in command.mentioned_agent_assignment_ids)
            or existing.site_revision_id != command.site_revision_id
        ):
            raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT")

    @staticmethod
    async def _validate_idempotent_skill_snapshots(
        *,
        run_id: UUID,
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        records = await (
            AgentRunSkillSnapshotV1Record
            .filter(run_id=run_id)
            .using_db(conn)
            .order_by("agent_order", "skill_order", "id")
        )
        actual = tuple(
            (
                record.agent_assignment_id,
                record.agent_version_id,
                record.agent_order,
                record.skill_order,
                record.installation_id,
                str(record.package_scope),
                record.package_id,
                record.skill_version_id,
                record.package_checksum,
                record.validation_policy_version,
                record.validation_finding_hash,
                record.context_byte_size,
            )
            for record in records
        )
        expected = tuple(
            (
                item.agent_assignment_id,
                item.agent_version_id,
                item.agent_order,
                item.skill_order,
                item.installation_id,
                item.package_scope,
                item.package_id,
                item.skill_version_id,
                item.package_checksum,
                item.validation_policy_version,
                item.validation_finding_hash,
                item.context_byte_size,
            )
            for item in command.skill_grants
        )
        if actual != expected:
            raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT")

    @staticmethod
    async def _validate_idempotent_design_system_snapshot(
        *,
        run_id: UUID,
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        record = await AgentRunDesignSystemSnapshotV1Record.filter(run_id=run_id).using_db(conn).first()
        expected = command.design_system_context
        if expected is None:
            if record is not None:
                raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT")
            return
        if (
            record is None
            or record.context_hash != expected.context.context_hash
            or record.context_byte_size != expected.context_byte_size
        ):
            raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT")

    @staticmethod
    async def _validate_idempotent_knowledge_snapshot(
        *,
        run_id: UUID,
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        record = await AgentRunKnowledgeSnapshotV1Record.filter(run_id=run_id).using_db(conn).first()
        sources = tuple(
            await AgentRunKnowledgeSourceSnapshotV1Record
            .filter(run_id=run_id)
            .using_db(conn)
            .order_by("source_order", "id")
        )
        expected = command.knowledge_context
        if expected is None:
            if record is not None or sources:
                raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT")
            return
        actual_sources = tuple(
            (
                item.source_order,
                item.knowledge_base_id,
                item.policy_revision,
                item.source_id,
                item.source_version_id,
                item.source_name,
                item.source_version_content_hash,
            )
            for item in sources
        )
        expected_sources = tuple(
            (
                item.source_order,
                item.knowledge_base_id,
                item.policy_revision,
                item.source_id,
                item.source_version_id,
                item.source_name,
                item.source_version_content_hash,
            )
            for item in expected.sources
        )
        if (
            record is None
            or record.context_hash != expected.context.context_hash
            or record.context_byte_size != expected.context_byte_size
            or record.source_snapshot_count != len(expected.sources)
            or actual_sources != expected_sources
        ):
            raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT")

    @staticmethod
    async def _validate_idempotent_builder_snapshot(
        *,
        run_id: UUID,
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        record = await AgentRunBuilderSnapshotV1Record.filter(run_id=run_id).using_db(conn).first()
        expected = command.builder_context
        if expected is None:
            if record is not None:
                raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT")
            return
        if (
            record is None
            or record.context_hash != expected.context.context_hash
            or record.context_byte_size != expected.context_byte_size
        ):
            raise AgentRuntimePersistenceError("AGENT_RUN_IDEMPOTENCY_CONFLICT")

    async def _create_run_graph(
        self,
        *,
        thread: AgentThreadV1Record,
        command: AgentRunCreatePersistenceCommand,
        event: RunCreatedEventV1,
        conn: BaseDBAsyncClient,
    ) -> PersistedAgentRunHead:
        run = await self.create_record(
            AgentRunV1Record,
            conn=conn,
            id=command.run_id,
            workspace_id=command.workspace_id,
            project_id=command.project_id,
            thread_id=thread.id,
            job_id=command.job_id,
            owner_user_id=command.owner_user_id,
            idempotency_key=command.idempotency_key,
            execution_mode=command.execution_mode,
            lead_agent_id=str(command.lead_agent_id),
            lead_agent_version_id=command.lead_agent_version_id,
            lead_agent_assignment_id=command.lead_agent_assignment_id,
            mentioned_agent_ids=[str(value) for value in command.mentioned_agent_ids],
            mentioned_agent_version_ids=[str(value) for value in command.mentioned_agent_version_ids],
            mentioned_agent_assignment_ids=[str(value) for value in command.mentioned_agent_assignment_ids],
            site_revision_id=command.site_revision_id,
            status=AgentRunStatusV1.CREATED,
            correlation_id=command.correlation_id,
            last_sequence=0,
        )
        await self._create_skill_snapshots(run_id=run.id, command=command, conn=conn)
        await self._create_knowledge_snapshot(run_id=run.id, command=command, conn=conn)
        await self._create_design_system_snapshot(run_id=run.id, command=command, conn=conn)
        await self._create_builder_snapshot(run_id=run.id, command=command, conn=conn)
        await self._create_user_message(run=run, command=command, event=event, conn=conn)
        await self._event_repository.append_first(run=run, event=event, conn=conn)
        return self.to_head(run)

    @staticmethod
    async def _create_skill_snapshots(
        *,
        run_id: UUID,
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        if not command.skill_grants:
            return
        records = [
            AgentRunSkillSnapshotV1Record(
                run_id=run_id,
                **item.model_dump(),
            )
            for item in command.skill_grants
        ]
        await AgentRunSkillSnapshotV1Record.bulk_create(records, using_db=conn)

    @staticmethod
    async def _create_design_system_snapshot(
        *,
        run_id: UUID,
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        resolved = command.design_system_context
        if resolved is None:
            return
        context = resolved.context
        await AgentRunDesignSystemSnapshotV1Record.create(
            using_db=conn,
            run_id=run_id,
            project_id=context.project_id,
            assignment_id=context.assignment_id,
            assignment_revision=context.assignment_revision,
            design_system_id=context.design_system_id,
            design_system_version_id=context.version_id,
            owner_kind=context.owner_kind,
            manifest_checksum=context.manifest_checksum,
            validation_finding_hash=context.validation_finding_hash,
            token_index_hash=context.token_index_hash,
            context_hash=context.context_hash,
            context_snapshot=context.model_dump(mode="json", by_alias=True),
            context_byte_size=resolved.context_byte_size,
        )

    @staticmethod
    async def _create_knowledge_snapshot(
        *,
        run_id: UUID,
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        resolved = command.knowledge_context
        if resolved is None:
            return
        context = resolved.context
        await AgentRunKnowledgeSnapshotV1Record.create(
            using_db=conn,
            run_id=run_id,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            workspace_revision_id=context.workspace_revision_id,
            project_revision_id=context.project_revision_id,
            context_hash=context.context_hash,
            context_snapshot=context.model_dump(mode="json", by_alias=True),
            context_byte_size=resolved.context_byte_size,
            source_snapshot_count=len(resolved.sources),
        )
        if resolved.sources:
            await AgentRunKnowledgeSourceSnapshotV1Record.bulk_create(
                [
                    AgentRunKnowledgeSourceSnapshotV1Record(
                        run_id=run_id,
                        **item.model_dump(),
                    )
                    for item in resolved.sources
                ],
                using_db=conn,
            )

    @staticmethod
    async def _create_builder_snapshot(
        *,
        run_id: UUID,
        command: AgentRunCreatePersistenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None:
        resolved = command.builder_context
        if resolved is None:
            return
        context = resolved.context
        await AgentRunBuilderSnapshotV1Record.create(
            using_db=conn,
            run_id=run_id,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            site_id=context.site_id,
            environment_id=context.environment_id,
            site_revision_id=context.site_revision_id,
            revision_number=context.revision_number,
            manifest_hash=context.manifest_hash,
            status_etag=context.status_etag,
            content_structure_revision_id=context.content_structure_revision_id,
            content_structure_hash=context.content_structure_hash,
            context_hash=context.context_hash,
            context_snapshot=context.model_dump(mode="json", by_alias=True),
            context_byte_size=resolved.context_byte_size,
        )

    async def _create_user_message(
        self,
        *,
        run: AgentRunV1Record,
        command: AgentRunCreatePersistenceCommand,
        event: RunCreatedEventV1,
        conn: BaseDBAsyncClient,
    ) -> None:
        message = await self.create_record(
            AgentMessageV1Record,
            conn=conn,
            thread_id=command.thread_id,
            run_id=run.id,
            role="user",
            status="complete",
            actor_user_id=command.owner_user_id,
            placement_kind="thread",
            created_at=event.occurred_at,
        )
        await self.create_record(
            AgentMessagePartV1Record,
            conn=conn,
            message_id=message.id,
            part_index=0,
            type="text",
            status="complete",
            text=command.message,
            payload={},
        )

    @staticmethod
    def to_head(record: AgentRunV1Record) -> PersistedAgentRunHead:
        if record.last_cursor is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_HEAD_INCOMPLETE")
        return PersistedAgentRunHead(
            run_id=record.id,
            thread_id=record.thread_id,
            status=str(record.status),
            last_sequence=record.last_sequence,
            last_cursor=record.last_cursor,
        )
