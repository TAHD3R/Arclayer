from __future__ import annotations

from uuid import UUID

from src.config import Settings
from src.core.exceptions import NotFound
from src.core.services import BaseService
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.workspaces.schema import WorkspaceDangerActionOut, WorkspaceDangerCapabilitiesOut


class WorkspaceDangerService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: OrganizationWorkspaceRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self.repo = repository or OrganizationWorkspaceRepository()

    async def get_capabilities(
        self, *, organization_id: UUID, workspace_id: UUID, user_id: UUID
    ) -> WorkspaceDangerCapabilitiesOut:
        workspace = await self.repo.get_active_workspace(organization_id=organization_id, workspace_id=workspace_id)
        if workspace is None:
            raise NotFound(error="NOT_FOUND")
        leave_blocked_reason = await self._get_leave_blocked_reason(workspace_id=workspace_id, user_id=user_id)
        delete_blocked_reason = await self._get_delete_blocked_reason(
            workspace_id=workspace_id,
            user_id=user_id,
        )
        return WorkspaceDangerCapabilitiesOut(
            workspace_id=workspace_id,
            confirm_delete_name=str(workspace.name),
            leave_action=WorkspaceDangerActionOut(
                enabled=leave_blocked_reason is None,
                blocked_reason=leave_blocked_reason,
            ),
            delete_action=WorkspaceDangerActionOut(
                enabled=delete_blocked_reason is None,
                blocked_reason=delete_blocked_reason,
            ),
        )

    async def _get_leave_blocked_reason(self, *, workspace_id: UUID, user_id: UUID) -> str | None:
        has_membership = await self.repo.has_active_membership(
            workspace_id=workspace_id,
            user_id=user_id,
        )
        if not has_membership:
            return "WORKSPACE_ACCESS_DENIED"
        is_owner = await self.repo.is_workspace_owner(workspace_id=workspace_id, user_id=user_id)
        return "WORKSPACE_OWNER_TRANSFER_REQUIRED" if is_owner else None

    async def _get_delete_blocked_reason(self, *, workspace_id: UUID, user_id: UUID) -> str | None:
        if not await self.repo.is_workspace_owner(workspace_id=workspace_id, user_id=user_id):
            return "WORKSPACE_OWNER_REQUIRED"
        return None
