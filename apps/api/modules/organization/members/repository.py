from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from tortoise.expressions import Q

from apps.api.common.repositories import BaseRepository
from apps.api.core.http.pagination import PageParams
from apps.api.modules.organization.models.org_invitation import (
    OrganizationEmailInvite,
    OrganizationInviteLink,
    OrganizationInviteLinkUseEvent,
)
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.organization.models.user import User
from apps.api.modules.workspaces.models.workspace import WorkspaceMembership, WorkspaceMembershipStatus


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

    async def disable_workspace_memberships(self, *, organization_id: UUID, user_id: UUID) -> None:
        await WorkspaceMembership.filter(
            user_id=user_id,
            workspace__organization_id=organization_id,
        ).update(status=WorkspaceMembershipStatus.DISABLED)

    async def list_workspace_memberships_for_user_ids(
        self,
        *,
        organization_id: UUID,
        user_ids: Sequence[UUID],
    ) -> list[WorkspaceMembership]:
        if not user_ids:
            return []

        return (
            await WorkspaceMembership.filter(
                workspace__organization_id=organization_id,
                workspace__is_active=True,
                user_id__in=list(user_ids),
                status__in=[WorkspaceMembershipStatus.ACTIVE, WorkspaceMembershipStatus.INVITED],
            )
            .select_related("workspace")
            .prefetch_related("membership_roles__role")
            .order_by("workspace__name", "created_at")
            .all()
        )

    async def has_pending_email_invite(self, *, organization_id: UUID, email: str) -> bool:
        now = datetime.now(UTC)
        return await OrganizationEmailInvite.filter(
            organization_id=organization_id,
            email=email,
            accepted_at=None,
            revoked_at=None,
        ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).exists()

    async def list_email_invites(
        self,
        *,
        organization_id: UUID,
        params: PageParams,
        q: str | None,
        status: str | None,
        mine: bool | None,
        current_user_id: UUID,
    ) -> tuple[int, list[OrganizationEmailInvite]]:
        qs = OrganizationEmailInvite.filter(organization_id=organization_id)
        now = datetime.now(UTC)

        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(Q(email__icontains=needle) | Q(role_code__icontains=needle))

        if mine:
            qs = qs.filter(created_by_user_id=current_user_id)

        if status:
            normalized = status.strip().lower()
            if normalized == "accepted":
                qs = qs.filter(accepted_at__not_isnull=True)
            elif normalized == "revoked":
                qs = qs.filter(revoked_at__not_isnull=True)
            elif normalized == "expired":
                qs = qs.filter(accepted_at=None, revoked_at=None, expires_at__not_isnull=True, expires_at__lte=now)
            elif normalized == "processed":
                qs = qs.filter(
                    Q(accepted_at__not_isnull=True)
                    | Q(revoked_at__not_isnull=True)
                    | (Q(accepted_at=None) & Q(revoked_at=None) & Q(expires_at__not_isnull=True) & Q(expires_at__lte=now))
                )
            elif normalized == "pending":
                qs = qs.filter(accepted_at=None, revoked_at=None).filter(
                    Q(expires_at__isnull=True) | Q(expires_at__gt=now)
                )

        total = int(await qs.count())
        rows = await qs.order_by("-created_at").limit(params.limit).offset(params.offset).all()
        return total, rows

    async def get_email_invite(self, *, organization_id: UUID, invitation_id: UUID) -> OrganizationEmailInvite | None:
        return await OrganizationEmailInvite.get_or_none(
            id=invitation_id,
            organization_id=organization_id,
        )

    async def list_invite_links(
        self,
        *,
        organization_id: UUID,
        params: PageParams,
        q: str | None,
        mine: bool | None,
        current_user_id: UUID,
    ) -> tuple[int, list[OrganizationInviteLink]]:
        qs = OrganizationInviteLink.filter(organization_id=organization_id)

        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(
                    Q(display_code__icontains=needle)
                    | Q(role_code__icontains=needle)
                    | Q(allowed_email_domain__icontains=needle)
                )

        if mine:
            qs = qs.filter(created_by_user_id=current_user_id)

        total = int(await qs.count())
        rows = await qs.order_by("-created_at").limit(params.limit).offset(params.offset).all()
        return total, rows

    async def get_invite_link(self, *, organization_id: UUID, link_id: UUID) -> OrganizationInviteLink | None:
        return await OrganizationInviteLink.get_or_none(id=link_id, organization_id=organization_id)

    async def list_invite_link_use_events(
        self,
        *,
        organization_id: UUID,
        link_id: UUID,
        params: PageParams,
    ) -> tuple[int, list[OrganizationInviteLinkUseEvent]]:
        qs = OrganizationInviteLinkUseEvent.filter(link_id=link_id, link__organization_id=organization_id)
        total = int(await qs.count())
        rows = await qs.order_by("-used_at").limit(params.limit).offset(params.offset).all()
        return total, rows

    async def get_users_map(self, *, user_ids: Sequence[UUID]) -> dict[UUID, User]:
        if not user_ids:
            return {}
        rows = await User.filter(id__in=list(user_ids)).all()
        return {UUID(str(row.id)): row for row in rows}
