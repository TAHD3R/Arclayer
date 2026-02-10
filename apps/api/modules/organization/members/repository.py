from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from tortoise.expressions import Q

from apps.api.common.repositories import BaseRepository
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.workspaces.models.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus


class OrganizationMemberRepository(BaseRepository):
    async def list_memberships(self, *, organization_id: UUID) -> list[OrgMembership]:
        return (
            await OrgMembership.filter(organization_id=organization_id)
            .select_related("user")
            .order_by("created_at")
            .all()
        )

    async def get_membership(self, *, organization_id: UUID, membership_id: UUID) -> OrgMembership | None:
        return await OrgMembership.get_or_none(id=membership_id, organization_id=organization_id).select_related("user")

    async def count_role_memberships(self, *, organization_id: UUID, role: OrgRole) -> int:
        return int(await OrgMembership.filter(organization_id=organization_id, role=role).count())

    async def find_user_membership_by_email(self, *, organization_id: UUID, email: str) -> OrgMembership | None:
        return await OrgMembership.get_or_none(
            organization_id=organization_id,
            user__email=email,
        ).select_related("user")

    async def first_active_workspace(self, *, organization_id: UUID) -> Workspace | None:
        return await Workspace.filter(organization_id=organization_id, is_active=True).order_by("created_at").first()

    async def disable_workspace_memberships(self, *, organization_id: UUID, user_id: UUID) -> None:
        await WorkspaceMembership.filter(
            user_id=user_id,
            workspace__organization_id=organization_id,
        ).update(status=WorkspaceMembershipStatus.DISABLED)

    async def list_active_memberships_for_workspace_ids(
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

    async def has_pending_invite(self, *, organization_id: UUID, workspace_id: UUID, email: str) -> bool:
        now = datetime.now(UTC)
        from apps.api.modules.workspaces.models.workspace_invite import WorkspaceEmailInvite

        return await WorkspaceEmailInvite.filter(
            organization_id=organization_id,
            workspace_id=workspace_id,
            email=email,
            accepted_at=None,
            revoked_at=None,
        ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).exists()
