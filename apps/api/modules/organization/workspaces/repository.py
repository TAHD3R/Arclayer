from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from apps.api.common.repositories import BaseRepository
from apps.api.modules.organization.models.user import User
from apps.api.modules.workspaces.models.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus


class OrganizationWorkspaceRepository(BaseRepository):
    async def list_active_workspaces_for_org(self, *, organization_id: UUID) -> list[Workspace]:
        return (
            await Workspace.filter(organization_id=organization_id, is_active=True)
            .order_by("created_at")
            .all()
        )

    async def list_active_workspaces_for_member(self, *, organization_id: UUID, user_id: UUID) -> list[Workspace]:
        rows = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            workspace__organization_id=organization_id,
            workspace__is_active=True,
        ).values_list("workspace_id", flat=True)
        workspace_ids = [UUID(str(item)) for item in rows]
        if not workspace_ids:
            return []
        return await Workspace.filter(id__in=workspace_ids, is_active=True).order_by("created_at").all()

    async def get_active_workspace(self, *, organization_id: UUID, workspace_id: UUID) -> Workspace | None:
        return await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)

    async def count_active_workspaces(self, *, organization_id: UUID) -> int:
        return int(await Workspace.filter(organization_id=organization_id, is_active=True).count())

    async def slug_exists(self, *, organization_id: UUID, slug: str) -> bool:
        return await Workspace.filter(organization_id=organization_id, is_active=True, slug=slug).exists()

    async def create_workspace(
        self,
        *,
        organization_id: UUID,
        slug: str,
        name: str,
        created_by_user_id: UUID,
    ) -> Workspace:
        return await Workspace.create(
            organization_id=organization_id,
            slug=slug,
            name=name,
            is_active=True,
            created_by_user_id=created_by_user_id,
        )

    async def list_active_memberships(
        self,
        *,
        workspace_ids: Sequence[UUID],
    ) -> list[WorkspaceMembership]:
        if not workspace_ids:
            return []
        return await WorkspaceMembership.filter(
            workspace_id__in=list(workspace_ids),
            status=WorkspaceMembershipStatus.ACTIVE,
        ).all()

    async def list_users(self, *, user_ids: Sequence[UUID]) -> list[User]:
        if not user_ids:
            return []
        return await User.filter(id__in=list(user_ids)).all()

    async def ensure_active_membership(self, *, workspace_id: UUID, user_id: UUID) -> WorkspaceMembership:
        membership, _created = await WorkspaceMembership.get_or_create(
            workspace_id=workspace_id,
            user_id=user_id,
            defaults={"status": WorkspaceMembershipStatus.ACTIVE, "invited_by_user_id": None},
        )
        if membership.status != WorkspaceMembershipStatus.ACTIVE:
            membership.status = WorkspaceMembershipStatus.ACTIVE
            await membership.save(update_fields=["status", "updated_at"])
        return membership
