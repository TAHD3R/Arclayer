from __future__ import annotations

from uuid import UUID

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import NotFound
from apps.api.src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from apps.api.src.modules.system.rbac.constants.service import ROLE_OWNER
from apps.api.src.modules.workspaces.authz.snapshot.service import get_workspace_authz_snapshot
from apps.api.src.modules.workspaces.schema import WorkspaceDangerActionOut, WorkspaceDangerCapabilitiesOut


class WorkspaceDangerService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def get_capabilities(
        self, *, organization_id: UUID, workspace_id: UUID, user_id: UUID
    ) -> WorkspaceDangerCapabilitiesOut:
        workspace = await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)
        if workspace is None:
            raise NotFound(message="资源不存在", error="NOT_FOUND")
        leave_blocked_reason = await self._get_leave_blocked_reason(workspace_id=workspace_id, user_id=user_id)
        delete_blocked_reason = await self._get_delete_blocked_reason(
            organization_id=organization_id,
            workspace_id=workspace_id,
            user_id=user_id,
        )
        return WorkspaceDangerCapabilitiesOut(
            workspace_id=workspace_id,
            organization_id=organization_id,
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
        membership = await WorkspaceMembership.get_or_none(
            workspace_id=workspace_id,
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        if membership is None:
            return "WORKSPACE_ACCESS_DENIED"
        is_owner_member = await WorkspaceMembership.filter(
            id=membership.id,
            membership_roles__role_id__in=await self._get_owner_role_ids(workspace_id=workspace_id),
        ).exists()
        if not is_owner_member:
            return None
        owner_count = await WorkspaceMembership.filter(
            workspace_id=workspace_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            membership_roles__role__code=ROLE_OWNER,
        ).count()
        if int(owner_count) <= 1:
            return "WORKSPACE_OWNER_AT_LEAST_ONE_REQUIRED"
        return None

    async def _get_delete_blocked_reason(
        self, *, organization_id: UUID, workspace_id: UUID, user_id: UUID
    ) -> str | None:
        snap = await get_workspace_authz_snapshot(user_id=user_id, workspace_id=workspace_id)
        if not (snap.is_superuser or "system:settings:manage" in set(snap.permission_codes)):
            return "WORKSPACE_SETTINGS_MANAGE_REQUIRED"
        active_count = await Workspace.filter(organization_id=organization_id, is_active=True, archived_at=None).count()
        if int(active_count) <= 1:
            return "LAST_ACTIVE_WORKSPACE_NOT_DELETABLE"
        return None

    async def _get_owner_role_ids(self, *, workspace_id: UUID) -> list[UUID]:
        from apps.api.src.models.system.rbac import Role

        rows = await Role.filter(workspace_id=workspace_id, code=ROLE_OWNER).values_list("id", flat=True)
        return [UUID(str(raw)) for raw in rows if raw is not None]
