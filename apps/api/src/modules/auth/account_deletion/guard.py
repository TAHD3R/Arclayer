from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.core.exceptions import Forbidden
from src.core.i18n import t


class AccountDeletionDataProvider(Protocol):
    async def list_owned_org_ids(self, *, user_id: UUID) -> list[UUID]: ...

    async def org_has_other_owner(self, *, organization_id: UUID, user_id: UUID) -> bool: ...

    async def list_owned_workspace_ids(self, *, user_id: UUID) -> list[UUID]: ...

    async def workspace_has_other_owner(self, *, workspace_id: UUID, user_id: UUID) -> bool: ...


class TortoiseAccountDeletionDataProvider(AccountDeletionDataProvider):
    async def list_owned_org_ids(self, *, user_id: UUID) -> list[UUID]:
        from src.models.organization.org_membership import OrgMembership, OrgRole

        rows = await OrgMembership.filter(user_id=user_id, status="active", role=OrgRole.OWNER).values_list(
            "organization_id",
            flat=True,
        )
        out: list[UUID] = []
        for raw in rows:
            try:
                out.append(UUID(str(raw)))
            except ValueError:
                continue
        return out

    async def org_has_other_owner(self, *, organization_id: UUID, user_id: UUID) -> bool:
        from src.models.organization.org_membership import OrgMembership, OrgRole

        return (
            await OrgMembership
            .filter(
                organization_id=organization_id,
                status="active",
                role=OrgRole.OWNER,
            )
            .exclude(user_id=user_id)
            .exists()
        )

    async def list_owned_workspace_ids(self, *, user_id: UUID) -> list[UUID]:
        from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus
        from src.modules.system.rbac.constants.service import ROLE_OWNER

        rows = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
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
                membership_roles__role__workspace_id=workspace_id,
            )
            .exclude(user_id=user_id)
            .exists()
        )


class AccountDeletionGuard:
    def __init__(self, *, data: AccountDeletionDataProvider | None = None) -> None:
        self.data = data or TortoiseAccountDeletionDataProvider()

    async def ensure_deletable(self, *, user_id: UUID) -> None:
        org_ids = await self.data.list_owned_org_ids(user_id=user_id)
        for org_id in org_ids:
            has_other = await self.data.org_has_other_owner(organization_id=org_id, user_id=user_id)
            if not has_other:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                    error="ACCOUNT_DELETE_LAST_ORG_OWNER",
                    meta={"organization_id": str(org_id)},
                )

        ws_ids = await self.data.list_owned_workspace_ids(user_id=user_id)
        for ws_id in ws_ids:
            has_other = await self.data.workspace_has_other_owner(workspace_id=ws_id, user_id=user_id)
            if not has_other:
                raise Forbidden(
                    message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                    error="ACCOUNT_DELETE_LAST_WORKSPACE_OWNER",
                    meta={"workspace_id": str(ws_id)},
                )
