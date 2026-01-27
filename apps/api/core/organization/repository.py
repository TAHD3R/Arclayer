from __future__ import annotations

from uuid import UUID

from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.models.organization import Membership, MembershipStatus, Organization


class OrganizationRepository(BaseRepository):
    def query_user_memberships(self, *, user_id: UUID) -> QuerySet[Membership]:
        return Membership.filter(user_id=user_id, status=MembershipStatus.ACTIVE)

    async def list_user_membership_pairs(self, *, user_id: UUID) -> list[tuple[UUID, UUID]]:
        """
        Return (membership_id, organization_id) pairs for active memberships.
        """

        rows = await self.query_user_memberships(user_id=user_id).values_list("id", "organization_id")
        pairs: list[tuple[UUID, UUID]] = []
        for membership_id, org_id in rows:
            pairs.append((UUID(str(membership_id)), UUID(str(org_id))))
        return pairs

    async def list_user_org_ids(self, *, user_id: UUID) -> list[UUID]:
        rows = await self.query_user_memberships(user_id=user_id).values_list("organization_id", flat=True)
        return [UUID(str(x)) for x in rows]

    async def list_user_organizations(self, *, user_id: UUID) -> list[Organization]:
        return await Organization.filter(
            memberships__user_id=user_id, memberships__status=MembershipStatus.ACTIVE
        ).all()

    async def list_user_memberships_with_org(self, *, user_id: UUID) -> list[Membership]:
        """
        List active memberships for a user, with organization preloaded.
        """

        return await (
            Membership
            .filter(user_id=user_id, status=MembershipStatus.ACTIVE)
            .select_related("organization")
            .all()
            .order_by("created_at")
        )

    async def ensure_membership(self, *, user_id: UUID, organization_id: UUID) -> Membership:
        membership, _ = await Membership.get_or_create(
            user_id=user_id,
            organization_id=organization_id,
            defaults={"status": MembershipStatus.ACTIVE},
        )
        return membership

    async def user_has_membership(self, *, user_id: UUID, organization_id: UUID) -> bool:
        return await Membership.filter(
            user_id=user_id,
            organization_id=organization_id,
            status=MembershipStatus.ACTIVE,
        ).exists()

    async def create_organization(self, *, slug: str, name: str, logo_url: str | None = None) -> Organization:
        return await Organization.create(slug=slug, name=name, logo_url=logo_url, is_active=True)
