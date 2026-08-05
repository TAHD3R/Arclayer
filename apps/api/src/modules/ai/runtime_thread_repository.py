from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.expressions import Q
from tortoise.transactions import in_transaction

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import (
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
)
from src.models.projects.project import ProjectRecord
from src.modules.ai.agent_catalog_schema import ResolvedAgentAssignment
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_snapshot_projector import project_message, project_message_part
from src.modules.ai.runtime_snapshot_schema import AgentMessagePartSnapshotV1, AgentMessageSnapshotV1
from src.modules.ai.runtime_thread_schema import AgentThreadCreateRequestV1, AgentThreadUpdateRequestV1

_ACTIVE_RUN_STATUSES = (
    AgentRunStatusV1.CREATED,
    AgentRunStatusV1.QUEUED,
    AgentRunStatusV1.RUNNING,
    AgentRunStatusV1.CANCELLATION_REQUESTED,
    AgentRunStatusV1.INTERRUPTED,
)


class AgentThreadRepository(TortoiseORMRepository[AgentThreadV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentThreadV1Record)

    async def create_idempotently(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        idempotency_key: str,
        payload: AgentThreadCreateRequestV1,
        resolved_agent: ResolvedAgentAssignment,
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentThreadV1Record, bool]:
        await self._require_project(workspace_id=workspace_id, project_id=payload.project_id, conn=conn)
        existing = await self._get_idempotent_create(
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            idempotency_key=idempotency_key,
            conn=conn,
        )
        if existing is not None:
            self._validate_exact_create(
                record=existing,
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                payload=payload,
                resolved_agent=resolved_agent,
            )
            return existing, False
        try:
            async with conn._in_transaction() as savepoint_conn:
                record = await self.create_record(
                    AgentThreadV1Record,
                    conn=savepoint_conn,
                    workspace_id=workspace_id,
                    project_id=payload.project_id,
                    owner_user_id=owner_user_id,
                    creation_idempotency_key=idempotency_key,
                    lead_agent_id=str(resolved_agent.agent_id),
                    lead_agent_version_id=resolved_agent.version_id,
                    lead_agent_assignment_id=resolved_agent.assignment_id,
                    title=payload.title,
                )
        except IntegrityError:
            raced = await self._get_idempotent_create(
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                idempotency_key=idempotency_key,
                conn=conn,
            )
            if raced is None:
                raise
            self._validate_exact_create(
                record=raced,
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                payload=payload,
                resolved_agent=resolved_agent,
            )
            return raced, False
        return record, True

    @staticmethod
    async def _get_idempotent_create(
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> AgentThreadV1Record | None:
        return await (
            AgentThreadV1Record
            .filter(
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                creation_idempotency_key=idempotency_key,
            )
            .using_db(conn)
            .first()
        )

    async def list_owned(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        project_id: UUID | None,
        archived: bool | None,
        query: str | None,
        cursor: UUID | None,
        limit: int,
    ) -> tuple[list[AgentThreadV1Record], UUID | None]:
        queryset = self._owned_queryset(
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            project_id=project_id,
            archived=archived,
            query=query,
        )
        if cursor is not None:
            cursor_record = await queryset.filter(id=cursor).first()
            if cursor_record is None:
                raise AgentRuntimePersistenceError("AGENT_THREAD_CURSOR_INVALID")
            same_pin_page = Q(is_pinned=cursor_record.is_pinned) & (
                Q(updated_at__lt=cursor_record.updated_at)
                | Q(updated_at=cursor_record.updated_at, id__lt=cursor_record.id)
            )
            cursor_filter = same_pin_page
            if cursor_record.is_pinned:
                cursor_filter = cursor_filter | Q(is_pinned=False)
            queryset = queryset.filter(cursor_filter)
        records = await queryset.order_by("-is_pinned", "-updated_at", "-id").limit(limit + 1)
        next_cursor = records[limit - 1].id if len(records) > limit else None
        return records[:limit], next_cursor

    async def get_owned(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        thread_id: UUID,
    ) -> AgentThreadV1Record:
        record = await AgentThreadV1Record.filter(
            id=thread_id,
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            deleted_at=None,
        ).first()
        if record is None:
            raise AgentRuntimePersistenceError("AGENT_THREAD_NOT_FOUND")
        return record

    async def get_owned_with_messages(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        thread_id: UUID,
    ) -> tuple[AgentThreadV1Record, UUID | None, tuple[AgentMessageSnapshotV1, ...]]:
        record = await self.get_owned(
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            thread_id=thread_id,
        )
        active_run = await (
            AgentRunV1Record
            .filter(
                thread_id=record.id,
                status__in=_ACTIVE_RUN_STATUSES,
            )
            .order_by("-created_at", "-id")
            .first()
        )
        messages = await self._messages(thread_id=record.id)
        return record, active_run.id if active_run is not None else None, messages

    async def update_owned(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        thread_id: UUID,
        payload: AgentThreadUpdateRequestV1,
        now: datetime,
    ) -> AgentThreadV1Record:
        async with in_transaction() as conn:
            record = await self._get_owned_for_update(
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                thread_id=thread_id,
                conn=conn,
            )
            fields: dict[str, object] = {}
            if payload.title is not None:
                fields["title"] = payload.title
            if payload.archived is not None:
                fields["archived_at"] = now if payload.archived else None
            if payload.pinned is not None:
                fields["is_pinned"] = payload.pinned
            fields["updated_at"] = now
            return await self.update_fields(record, fields=fields, conn=conn)

    async def soft_delete_owned(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        thread_id: UUID,
        deleted_at: datetime,
    ) -> AgentThreadV1Record:
        async with in_transaction() as conn:
            record = await self._get_owned_for_update(
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                thread_id=thread_id,
                conn=conn,
            )
            return await self.update_fields(
                record,
                fields={"deleted_at": deleted_at, "updated_at": deleted_at},
                conn=conn,
            )

    @staticmethod
    async def _require_project(
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        if project_id is None:
            return
        exists = (
            await ProjectRecord
            .filter(
                id=project_id,
                workspace_id=workspace_id,
                is_active=True,
            )
            .using_db(conn)
            .exists()
        )
        if not exists:
            raise AgentRuntimePersistenceError("AGENT_PROJECT_NOT_FOUND")

    @staticmethod
    def _validate_exact_create(
        *,
        record: AgentThreadV1Record,
        workspace_id: UUID,
        owner_user_id: UUID,
        payload: AgentThreadCreateRequestV1,
        resolved_agent: ResolvedAgentAssignment,
    ) -> None:
        if (
            record.workspace_id != workspace_id
            or record.owner_user_id != owner_user_id
            or record.project_id != payload.project_id
            or record.lead_agent_id != str(resolved_agent.agent_id)
            or record.lead_agent_version_id != resolved_agent.version_id
            or record.lead_agent_assignment_id != resolved_agent.assignment_id
            or record.title != payload.title
            or record.deleted_at is not None
        ):
            raise AgentRuntimePersistenceError("AGENT_THREAD_IDEMPOTENCY_CONFLICT")

    @staticmethod
    def _owned_queryset(
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        project_id: UUID | None,
        archived: bool | None,
        query: str | None,
    ):
        queryset = AgentThreadV1Record.filter(
            workspace_id=workspace_id,
            owner_user_id=owner_user_id,
            deleted_at=None,
        )
        if project_id is not None:
            queryset = queryset.filter(project_id=project_id)
        if archived is not None:
            queryset = queryset.filter(archived_at__not_isnull=True) if archived else queryset.filter(archived_at=None)
        if query:
            queryset = queryset.filter(title__icontains=query)
        return queryset

    @staticmethod
    async def _get_owned_for_update(
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        thread_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentThreadV1Record:
        record = (
            await AgentThreadV1Record
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
        if record is None:
            raise AgentRuntimePersistenceError("AGENT_THREAD_NOT_FOUND")
        return record

    @staticmethod
    async def _messages(*, thread_id: UUID) -> tuple[AgentMessageSnapshotV1, ...]:
        records = await AgentMessageV1Record.filter(thread_id=thread_id).order_by("created_at", "id")
        parts = await AgentMessagePartV1Record.filter(message_id__in=[record.id for record in records]).order_by(
            "message_id", "part_index"
        )
        parts_by_message: dict[UUID, list[AgentMessagePartSnapshotV1]] = {}
        for part in parts:
            parts_by_message.setdefault(part.message_id, []).append(project_message_part(part))
        return tuple(project_message(record, parts=tuple(parts_by_message.get(record.id, ()))) for record in records)
