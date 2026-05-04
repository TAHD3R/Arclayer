from __future__ import annotations

from uuid import UUID

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.tenancy.workspace_tenant import WorkspaceTenantRecord


class TenancyRepository(TortoiseORMRepository):
    async def get_workspace_tenant(self, *, workspace_id: UUID) -> WorkspaceTenantRecord | None:
        return await WorkspaceTenantRecord.get_or_none(workspace_id=workspace_id)
