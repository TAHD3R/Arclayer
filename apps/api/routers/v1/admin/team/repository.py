from __future__ import annotations

from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from apps.api.common.constants.users import ADMIN_USERS_ALLOWED_ORDER_FIELDS
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

        if filters.user_status is not None:
            qs = qs.filter(user__status=filters.user_status)

        if filters.role_code:
            qs = qs.filter(membership_roles__role__code=filters.role_code)

        ordering = (filters.ordering or "").strip()
        if ordering:
            qs = qs.order_by(*_normalize_team_member_ordering(ordering))
        else:
            qs = qs.order_by("-created_at")

        # Joins may introduce duplicates.
        return qs.distinct()

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


_ALLOWED_USER_ORDER_FIELDS = ADMIN_USERS_ALLOWED_ORDER_FIELDS


def _normalize_team_member_ordering(value: str) -> list[str]:
    """
    Normalize ordering into a safe `order_by()` list.

    Supported:
    - Membership fields: created_at, updated_at, status
    - User fields (namespaced): user__<field>, where <field> is in ADMIN_USERS_ALLOWED_ORDER_FIELDS
      e.g. user__username, -user__last_login_at
    """

    fields: list[str] = []
    for part in value.split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw

        # Membership fields.
        if name in {"created_at", "updated_at", "status"}:
            fields.append(f"-{name}" if desc else name)
            continue

        # User fields: user__<allowed>
        if name.startswith("user__"):
            suffix = name.removeprefix("user__")
            if suffix in _ALLOWED_USER_ORDER_FIELDS:
                fields.append(f"-{name}" if desc else name)

    return fields or ["-created_at"]
