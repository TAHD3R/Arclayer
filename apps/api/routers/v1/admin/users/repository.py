from __future__ import annotations

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.core.organization.context import get_current_org_id
from apps.api.models.organization import MembershipStatus
from apps.api.models.user import User
from apps.api.routers.v1.admin.users.schema import AdminUserListQuery


class AdminUsersRepository(BaseRepository):
    def query_users(self, *, filters: AdminUserListQuery) -> QuerySet[User]:
        qs = User.all()

        # Admin user management is org-aware (members under current org).
        org_id = get_current_org_id()
        if org_id is not None:
            qs = qs.filter(memberships__organization_id=org_id, memberships__status=MembershipStatus.ACTIVE)

        if filters.q:
            needle = filters.q.strip()
            if needle:
                qs = qs.filter(
                    Q(username__icontains=needle) | Q(email__icontains=needle) | Q(display_name__icontains=needle)
                )

        if filters.status is not None:
            qs = qs.filter(status=filters.status)

        if filters.role_code:
            # Role bindings are org-scoped via MembershipRole.
            qs = qs.filter(memberships__membership_roles__role__code=filters.role_code)

        # Joins (e.g. role filter) may introduce duplicates.
        qs = qs.distinct()

        ordering = (filters.ordering or "").strip()
        if ordering:
            qs = qs.order_by(*_normalize_ordering(ordering))
        else:
            qs = qs.order_by("-created_at")

        return qs

    async def get_user(self, *, user_id) -> User | None:
        return await User.get_or_none(id=user_id)

    async def save_updates(self, user: User, *, updates: dict) -> User:
        for key, value in updates.items():
            setattr(user, key, value)
        await user.save()
        return user


_ALLOWED_ORDER_FIELDS = {
    "created_at",
    "updated_at",
    "username",
    "email",
    "status",
    "last_login_at",
}


def _normalize_ordering(value: str) -> list[str]:
    fields: list[str] = []
    for part in value.split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw
        if name not in _ALLOWED_ORDER_FIELDS:
            continue
        fields.append(f"-{name}" if desc else name)
    return fields or ["-created_at"]
