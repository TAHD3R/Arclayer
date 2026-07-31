from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.core.exceptions import Forbidden
from src.core.i18n import t
from src.modules.organization.settings.repository import OrganizationSettingsRepository


class OrgLeaveDataProvider(Protocol):
    async def list_owned_workspace_ids_in_org(self, *, organization_id: UUID, user_id: UUID) -> list[UUID]: ...


class OrganizationLeaveGuard:
    def __init__(self, *, data: OrgLeaveDataProvider | None = None) -> None:
        self.data = data or OrganizationSettingsRepository()

    async def ensure_can_leave(self, *, organization_id: UUID, user_id: UUID) -> None:
        owned_ws_ids = await self.data.list_owned_workspace_ids_in_org(organization_id=organization_id, user_id=user_id)
        for ws_id in owned_ws_ids:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED"),
                error="ORG_LEAVE_OWNED_WORKSPACE_REQUIRES_TRANSFER",
                meta={"workspace_id": str(ws_id)},
            )
