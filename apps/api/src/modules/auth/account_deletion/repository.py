from __future__ import annotations

from uuid import UUID

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.platform_identity.identity import (
    PlatformInstanceOwnership,
    PlatformOperator,
    PlatformOperatorStatus,
)
from src.models.workspaces.workspace import Workspace


class AccountDeletionRepository(TortoiseORMRepository):
    async def is_platform_instance_owner(self, *, user_id: UUID) -> bool:
        return await PlatformInstanceOwnership.filter(
            singleton_key="instance",
            owner_user_id=user_id,
        ).exists()

    async def has_active_platform_access(self, *, user_id: UUID) -> bool:
        return await PlatformOperator.filter(
            user_id=user_id,
            status=PlatformOperatorStatus.ACTIVE,
        ).exists()

    async def list_owned_org_ids(self, *, user_id: UUID) -> list[UUID]:
        rows = await OrgMembership.filter(
            user_id=user_id,
            status="active",
            role=OrgRole.OWNER,
        ).values_list("organization_id", flat=True)
        return [UUID(str(raw)) for raw in rows]

    async def org_has_other_owner(self, *, organization_id: UUID, user_id: UUID) -> bool:
        return await (
            OrgMembership
            .filter(
                organization_id=organization_id,
                status="active",
                role=OrgRole.OWNER,
            )
            .exclude(user_id=user_id)
            .exists()
        )

    async def list_owned_workspace_ids(self, *, user_id: UUID) -> list[UUID]:
        rows = await Workspace.filter(
            owner_user_id=user_id,
            deleted_at__isnull=True,
        ).values_list("id", flat=True)
        return sorted(UUID(str(raw)) for raw in rows)
