from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.core.exceptions import Forbidden
from src.core.i18n import t
from src.modules.auth.account_deletion.repository import AccountDeletionRepository


class AccountDeletionDataProvider(Protocol):
    async def list_owned_org_ids(self, *, user_id: UUID) -> list[UUID]: ...

    async def org_has_other_owner(self, *, organization_id: UUID, user_id: UUID) -> bool: ...

    async def list_owned_workspace_ids(self, *, user_id: UUID) -> list[UUID]: ...

    async def is_platform_instance_owner(self, *, user_id: UUID) -> bool: ...

    async def has_active_platform_access(self, *, user_id: UUID) -> bool: ...


class AccountDeletionGuard:
    def __init__(self, *, data: AccountDeletionDataProvider | None = None) -> None:
        self.data = data or AccountDeletionRepository()

    async def ensure_deletable(self, *, user_id: UUID) -> None:
        if await self.data.is_platform_instance_owner(user_id=user_id):
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED"),
                error="ACCOUNT_DELETE_PLATFORM_OWNER_REQUIRES_TRANSFER",
            )
        if await self.data.has_active_platform_access(user_id=user_id):
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED"),
                error="ACCOUNT_DELETE_PLATFORM_ACCESS_REQUIRES_REMOVAL",
            )

        org_ids = await self.data.list_owned_org_ids(user_id=user_id)
        for org_id in org_ids:
            has_other = await self.data.org_has_other_owner(organization_id=org_id, user_id=user_id)
            if not has_other:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED"),
                    error="ACCOUNT_DELETE_LAST_ORG_OWNER",
                    meta={"organization_id": str(org_id)},
                )

        ws_ids = await self.data.list_owned_workspace_ids(user_id=user_id)
        for ws_id in ws_ids:
            raise Forbidden(
                message=t("errors", "PERMISSION_DENIED"),
                error="ACCOUNT_DELETE_OWNED_WORKSPACE_REQUIRES_TRANSFER",
                meta={"workspace_id": str(ws_id)},
            )
