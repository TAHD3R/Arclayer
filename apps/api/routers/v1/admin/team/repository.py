from __future__ import annotations

from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.models.organization import Membership
from apps.api.models.rbac import MembershipRole, Role
from apps.api.routers.v1.admin.team.schema import TeamMemberListQuery


class TeamRepository(BaseRepository):
    def query_memberships(self, *, organization_id: UUID, filters: TeamMemberListQuery) -> QuerySet[Membership]:
        qs = Membership.filter(organization_id=organization_id).select_related("user")

        if filters.status is not None:
            qs = qs.filter(status=filters.status)

        if filters.q:
            needle = filters.q.strip()
            if needle:
                qs = qs.filter(
                    Q(user__username__icontains=needle)
                    | Q(user__email__icontains=needle)
                    | Q(user__display_name__icontains=needle)
                )

        if filters.role_code:
            qs = qs.filter(membership_roles__role__code=filters.role_code)

        # Joins may introduce duplicates.
        return qs.distinct().order_by("-created_at")

    async def get_membership(self, *, membership_id: UUID, organization_id: UUID) -> Membership | None:
        return await Membership.get_or_none(id=membership_id, organization_id=organization_id).select_related("user")

    async def replace_membership_roles(self, *, membership_id: UUID, role_ids: list[UUID]) -> None:
        await MembershipRole.filter(membership_id=membership_id).delete()
        for rid in role_ids:
            await MembershipRole.get_or_create(membership_id=membership_id, role_id=rid)

    async def get_roles_by_codes(self, *, role_codes: list[str]) -> list[Role]:
        if not role_codes:
            return []
        return await Role.filter(code__in=role_codes).all()
