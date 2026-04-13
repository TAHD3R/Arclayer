from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.core.exceptions import Forbidden
from src.core.i18n import t


class OrgLeaveDataProvider(Protocol):
    async def list_owned_workspace_ids_in_org(self, *, organization_id: UUID, user_id: UUID) -> list[UUID]: ...

    async def workspace_has_other_owner(self, *, workspace_id: UUID, user_id: UUID) -> bool: ...


class TortoiseOrgLeaveDataProvider(OrgLeaveDataProvider):
    async def list_owned_workspace_ids_in_org(self, *, organization_id: UUID, user_id: UUID) -> list[UUID]:
        from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus
        from src.modules.system.rbac.constants.service import ROLE_OWNER

        rows = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            workspace__organization_id=organization_id,
            membership_roles__role__code=ROLE_OWNER,
        ).values_list("workspace_id", flat=True)
        out: list[UUID] = []
        for raw in rows:
            try:
                out.append(UUID(str(raw)))
            except ValueError:
                continue
        return sorted(set(out))

    async def workspace_has_other_owner(self, *, workspace_id: UUID, user_id: UUID) -> bool:
        from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus
        from src.modules.system.rbac.constants.service import ROLE_OWNER

        return (
            await WorkspaceMembership
            .filter(
                workspace_id=workspace_id,
                status=WorkspaceMembershipStatus.ACTIVE,
                membership_roles__role__code=ROLE_OWNER,
            )
            .exclude(user_id=user_id)
            .exists()
        )


class OrganizationLeaveGuard:
    def __init__(self, *, data: OrgLeaveDataProvider | None = None) -> None:
        self.data = data or TortoiseOrgLeaveDataProvider()

    async def ensure_can_leave(self, *, organization_id: UUID, user_id: UUID) -> None:
        owned_ws_ids = await self.data.list_owned_workspace_ids_in_org(organization_id=organization_id, user_id=user_id)
        for ws_id in owned_ws_ids:
            has_other_owner = await self.data.workspace_has_other_owner(workspace_id=ws_id, user_id=user_id)
            if not has_other_owner:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED"),
                    error="ORG_LEAVE_LAST_WORKSPACE_OWNER",
                    meta={"workspace_id": str(ws_id)},
                )
