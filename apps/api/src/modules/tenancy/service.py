from __future__ import annotations

from uuid import UUID

from src.config import Settings
from src.core.exceptions import NotFound
from src.core.services import BaseService
from src.modules.tenancy.repository import TenancyRepository
from src.modules.tenancy.schema import TenantIdentityOut, TenantIsolationMode


class TenancyService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = TenancyRepository()

    async def get_workspace_tenant(self, *, workspace_id: UUID) -> TenantIdentityOut:
        tenant = await self.repo.get_workspace_tenant(workspace_id=workspace_id)
        if tenant is None:
            raise NotFound(error="WORKSPACE_TENANT_NOT_FOUND")
        return TenantIdentityOut(
            organization_id=tenant.organization_id,
            workspace_id=tenant.workspace_id,
            project_id=None,
            runtime_id=None,
            site_id=None,
            schema_name=tenant.schema_name,
            isolation_mode=TenantIsolationMode(str(tenant.isolation_mode)),
        )
