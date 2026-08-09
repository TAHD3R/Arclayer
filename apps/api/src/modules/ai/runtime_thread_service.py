from __future__ import annotations

from datetime import UTC, datetime
from typing import NoReturn
from uuid import UUID

from src.config import Settings
from src.core.events import events
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService, DomainEventPublisher
from src.models.agents.runtime_v1 import AgentThreadV1Record
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError
from src.modules.ai.runtime_thread_repository import AgentThreadRepository
from src.modules.ai.runtime_thread_schema import (
    AgentThreadCreateRequestV1,
    AgentThreadDeleteResultV1,
    AgentThreadDetailV1,
    AgentThreadListV1,
    AgentThreadOutV1,
    AgentThreadUpdateRequestV1,
)


class AgentThreadService(BaseService):
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        repository: AgentThreadRepository | None = None,
        catalog_service: AgentCatalogService | None = None,
        event_publisher: DomainEventPublisher | None = events,
    ) -> None:
        super().__init__(settings, event_publisher=event_publisher, default_event_source="agent_thread")
        self._repository = repository or AgentThreadRepository()
        self._catalog_service = catalog_service or AgentCatalogService(self.settings)

    async def create(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        idempotency_key: str,
        payload: AgentThreadCreateRequestV1,
    ) -> AgentThreadOutV1:
        normalized_key = idempotency_key.strip()
        await self._catalog_service.ensure_official_assignments(workspace_id=workspace_id)
        try:
            async with self.tx() as conn:
                resolved_agent = await self._catalog_service.resolve_lead(
                    workspace_id=workspace_id,
                    project_id=payload.project_id,
                    agent_id=payload.lead_agent_id,
                    conn=conn,
                    ensure_catalog=False,
                )
                record, created = await self._repository.create_idempotently(
                    workspace_id=workspace_id,
                    owner_user_id=owner_user_id,
                    idempotency_key=normalized_key,
                    payload=payload,
                    resolved_agent=resolved_agent,
                    conn=conn,
                )
                if created:
                    await self._catalog_service.mark_used(assignment_id=resolved_agent.assignment_id, conn=conn)
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)
        if created:
            await self.publish_domain_event(
                name="agent.thread.created",
                payload={"thread_id": str(record.id), "workspace_id": str(workspace_id)},
                actor_user_id=owner_user_id,
            )
        return self._to_out(record)

    async def list(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        project_id: UUID | None,
        archived: bool | None,
        query: str | None,
        cursor: UUID | None,
        limit: int,
    ) -> AgentThreadListV1:
        try:
            records, next_cursor = await self._repository.list_owned(
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                project_id=project_id,
                archived=archived,
                query=query,
                cursor=cursor,
                limit=limit,
            )
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)
        return AgentThreadListV1(
            items=tuple(self._to_out(record) for record in records),
            next_cursor=next_cursor,
        )

    async def get(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        thread_id: UUID,
    ) -> AgentThreadDetailV1:
        try:
            (
                record,
                active_run_id,
                latest_completed_plan_run_id,
                messages,
            ) = await self._repository.get_owned_with_messages(
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                thread_id=thread_id,
            )
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)
        return AgentThreadDetailV1(
            **self._to_out(record).model_dump(),
            active_run_id=active_run_id,
            latest_completed_plan_run_id=latest_completed_plan_run_id,
            messages=messages,
        )

    async def update(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        thread_id: UUID,
        payload: AgentThreadUpdateRequestV1,
    ) -> AgentThreadOutV1:
        try:
            record = await self._repository.update_owned(
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                thread_id=thread_id,
                payload=payload,
                now=datetime.now(UTC),
            )
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)
        await self.publish_domain_event(
            name="agent.thread.updated",
            payload={"thread_id": str(record.id), "workspace_id": str(workspace_id)},
            actor_user_id=owner_user_id,
        )
        return self._to_out(record)

    async def delete(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        thread_id: UUID,
    ) -> AgentThreadDeleteResultV1:
        deleted_at = datetime.now(UTC)
        try:
            record = await self._repository.soft_delete_owned(
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                thread_id=thread_id,
                deleted_at=deleted_at,
            )
        except AgentRuntimePersistenceError as error:
            self._raise_http(error)
        await self.publish_domain_event(
            name="agent.thread.deleted",
            payload={"thread_id": str(record.id), "workspace_id": str(workspace_id)},
            actor_user_id=owner_user_id,
        )
        return AgentThreadDeleteResultV1(thread_id=record.id, deleted_at=deleted_at)

    @staticmethod
    def _to_out(record: AgentThreadV1Record) -> AgentThreadOutV1:
        if record.lead_agent_version_id is None or record.lead_agent_assignment_id is None:
            raise AgentRuntimePersistenceError("AGENT_THREAD_AGENT_SNAPSHOT_MISSING")
        return AgentThreadOutV1(
            thread_id=record.id,
            workspace_id=record.workspace_id,
            project_id=record.project_id,
            lead_agent_id=UUID(record.lead_agent_id),
            lead_agent_version_id=record.lead_agent_version_id,
            lead_agent_assignment_id=record.lead_agent_assignment_id,
            title=record.title,
            pinned=record.is_pinned,
            archived_at=record.archived_at,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    @staticmethod
    def _raise_http(error: AgentRuntimePersistenceError) -> NoReturn:
        if error.code in {"AGENT_THREAD_NOT_FOUND", "AGENT_PROJECT_NOT_FOUND"}:
            raise NotFound(error=error.code, message=t("errors", error.code)) from error
        if error.code == "AGENT_THREAD_IDEMPOTENCY_CONFLICT":
            raise Conflict(error=error.code, message=t("errors", error.code)) from error
        if error.code == "AGENT_THREAD_CURSOR_INVALID":
            raise BadRequest(error=error.code, message=t("errors", error.code)) from error
        raise error
