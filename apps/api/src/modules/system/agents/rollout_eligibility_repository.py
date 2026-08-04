from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.workspaces.workspace import Workspace


class TortoiseAgentWorkspaceEligibilityRepository(TortoiseORMRepository):
    async def list_active_workspace_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
    ) -> tuple[UUID, ...]:
        values = await (
            Workspace
            .filter(is_active=True, archived_at=None, deleted_at=None)
            .using_db(conn)
            .order_by("id")
            .values_list("id", flat=True)
        )
        return tuple(UUID(str(value)) for value in values)

    async def is_active_workspace(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> bool:
        return await (
            Workspace
            .filter(
                id=workspace_id,
                is_active=True,
                archived_at=None,
                deleted_at=None,
            )
            .using_db(conn)
            .exists()
        )
