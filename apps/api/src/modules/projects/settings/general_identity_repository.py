from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import NotFound
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.projects.project import ProjectRecord


class ProjectGeneralIdentityRepository(TortoiseORMRepository):
    async def get_identity(self, *, project_id: UUID) -> ProjectRecord:
        project = await ProjectRecord.get_or_none(id=project_id)
        if project is None:
            raise NotFound("Project not found", error="PROJECT_NOT_FOUND")
        return project

    async def get_identity_for_update(
        self,
        *,
        project_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ProjectRecord:
        project = await ProjectRecord.filter(id=project_id).using_db(conn).select_for_update().first()
        if project is None:
            raise NotFound("Project not found", error="PROJECT_NOT_FOUND")
        return project

    async def save_identity(
        self,
        *,
        project_id: UUID,
        values: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> None:
        updated = await (
            ProjectRecord.filter(id=project_id).using_db(conn).update(**values, updated_at=datetime.now(UTC))
        )
        if updated != 1:
            raise RuntimeError("Locked project identity row could not be updated")
