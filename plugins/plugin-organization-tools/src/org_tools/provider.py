from __future__ import annotations

from uuid import UUID

from apps.api.config import get_settings
from org_tools.services import OrgToolsService


class AdminOrgToolsProviderImpl:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._service = OrgToolsService(self._settings)

    async def validate(self):
        return await self._service.validate()

    async def repair_directory(self, *, actor_user_id: UUID | None):
        return await self._service.repair_directory(actor_user_id=actor_user_id)

    async def repair_primary_department(self, *, actor_user_id: UUID | None):
        return await self._service.repair_primary_departments(actor_user_id=actor_user_id)

    async def move_department(self, *, department_id: UUID, payload, actor_user_id: UUID | None) -> None:
        await self._service.move_department(department_id=department_id, payload=payload, actor_user_id=actor_user_id)

    async def merge_department(self, *, department_id: UUID, payload, actor_user_id: UUID | None) -> None:
        await self._service.merge_departments(
            source_department_id=department_id, payload=payload, actor_user_id=actor_user_id
        )

    async def reorder_departments(self, *, payload, actor_user_id: UUID | None) -> None:
        await self._service.reorder_departments(payload=payload, actor_user_id=actor_user_id)
