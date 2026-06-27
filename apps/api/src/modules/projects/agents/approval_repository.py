from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.approval import AgentApprovalRecord, AgentApprovalStatus, AgentApprovalTargetType
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.schema import TenantContext


class AgentApprovalRepository(TortoiseORMRepository):
    def __init__(self, *, tenant_context: TenantContext | None = None) -> None:
        super().__init__()
        self.tenant_db = TenantDatabaseRouter(tenant_context) if tenant_context is not None else None

    @asynccontextmanager
    async def content_connection(
        self, conn: BaseDBAsyncClient | None = None
    ) -> AsyncIterator[BaseDBAsyncClient | None]:
        if self.tenant_db is None:
            yield conn
            return
        async with self.tenant_db.connection(conn) as tenant_conn:
            yield tenant_conn

    async def create_approval(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        requester_user_id: UUID,
        skill_id: str,
        tool_name: str | None,
        action: str,
        target_type: AgentApprovalTargetType,
        target_id: UUID | None,
        expected_draft_version: int | None,
        target_snapshot: dict[str, Any],
        proposed_patch: dict[str, Any],
        dry_run: dict[str, Any],
        expires_at: datetime,
        agent_run_id: UUID | None = None,
    ) -> AgentApprovalRecord:
        return await AgentApprovalRecord.create(
            workspace_id=workspace_id,
            project_id=project_id,
            requester_user_id=requester_user_id,
            skill_id=skill_id,
            tool_name=tool_name,
            action=action,
            target_type=target_type,
            target_id=target_id,
            expected_draft_version=expected_draft_version,
            target_snapshot=target_snapshot,
            proposed_patch=proposed_patch,
            dry_run=dry_run,
            expires_at=expires_at,
            agent_run_id=agent_run_id,
        )

    async def list_approvals(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        limit: int = 50,
        status: AgentApprovalStatus | None = None,
    ) -> list[AgentApprovalRecord]:
        query = AgentApprovalRecord.filter(workspace_id=workspace_id, project_id=project_id)
        if status is not None:
            query = query.filter(status=status)
        return list(await query.order_by("-created_at", "-id").limit(limit))

    async def get_scoped_approval(
        self,
        *,
        approval_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> AgentApprovalRecord | None:
        query = AgentApprovalRecord.filter(id=approval_id, workspace_id=workspace_id, project_id=project_id)
        if for_update:
            query = query.select_for_update()
        return await self.using_db(query.first(), conn)

    async def save_approval_fields(
        self,
        approval: AgentApprovalRecord,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> AgentApprovalRecord:
        for key, value in fields.items():
            setattr(approval, key, value)
        update_fields = [*fields.keys(), "updated_at"]
        if conn is None:
            await approval.save(update_fields=update_fields)
        else:
            await approval.save(update_fields=update_fields, using_db=conn)
        return approval

    async def get_content_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> ContentItemRecord | None:
        async with self.content_connection(conn) as tenant_conn:
            query = ContentItemRecord.filter(
                id=item_id,
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
            ).prefetch_related("model_definition", "model_definition__fields")
            if for_update:
                query = query.select_for_update()
            return await self.using_db(query.first(), tenant_conn)

    async def get_content_draft_version(
        self,
        *,
        item_id: UUID,
        draft_version: int,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentVersionRecord | None:
        if draft_version <= 0:
            return None
        async with self.content_connection(conn) as tenant_conn:
            query = ContentVersionRecord.filter(item_id=item_id, version=draft_version).first()
            return await self.using_db(query, tenant_conn)
