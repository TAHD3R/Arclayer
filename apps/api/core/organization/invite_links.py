from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.models.invitation import OrganizationInviteLink


class InviteLinkRepository(BaseRepository):
    def query_links(self, *, organization_id: UUID) -> QuerySet[OrganizationInviteLink]:
        return OrganizationInviteLink.filter(organization_id=organization_id)

    async def create_link(
        self,
        *,
        organization_id: UUID,
        role_code: str | None,
        token_hash: str,
        code: str,
        expires_at: datetime | None,
        created_by_user_id: UUID | None,
    ) -> OrganizationInviteLink:
        return await OrganizationInviteLink.create(
            organization_id=organization_id,
            role_code=role_code,
            token_hash=token_hash,
            code=code,
            expires_at=expires_at,
            created_by_user_id=created_by_user_id,
        )

    def apply_filters(
        self,
        *,
        qs: QuerySet[OrganizationInviteLink],
        q: str | None,
    ) -> QuerySet[OrganizationInviteLink]:
        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(Q(code__icontains=needle) | Q(role_code__icontains=needle))
        return qs

    async def disable_link(
        self,
        *,
        organization_id: UUID,
        link_id: UUID,
        now: datetime | None = None,
    ) -> int:
        now = now or datetime.now(UTC)
        return await OrganizationInviteLink.filter(
            id=link_id,
            organization_id=organization_id,
            disabled_at=None,
        ).update(disabled_at=now)

    async def disable_all(
        self,
        *,
        organization_id: UUID,
        now: datetime | None = None,
    ) -> int:
        now = now or datetime.now(UTC)
        return await OrganizationInviteLink.filter(
            organization_id=organization_id,
            disabled_at=None,
        ).update(disabled_at=now)
