from __future__ import annotations

from uuid import UUID

from src.common.services import BaseService
from src.config import Settings
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository


class OrgWorkspaceCreationPolicy(BaseService):
    """Business guard for the current 1 org <= 1 workspace contract."""

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrganizationWorkspaceRepository()

    async def assert_can_create(self, *, organization_id: UUID) -> None:
        workspace_count = await self.repo.count_active_workspaces(organization_id=organization_id)
        if workspace_count >= 1:
            raise Conflict(
                message=t("errors", "CONFLICT", default="资源冲突"),
                error="ORG_WORKSPACE_LIMIT_REACHED",
            )

    async def is_legacy_org(self, *, organization_id: UUID) -> bool:
        workspace_count = await self.repo.count_active_workspaces(organization_id=organization_id)
        return workspace_count > 1
