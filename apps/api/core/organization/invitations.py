from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.models.invitation import OrganizationInvitation


def generate_invite_token() -> str:
    """
    Generate a random invite token to be shared with the invitee.

    Notes:
    - We only store the SHA256 hash in DB, never store the raw token.
    - token_urlsafe() is URL-friendly and suitable for copy/paste links.
    """

    return secrets.token_urlsafe(32)


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def build_expires_at(*, expires_in_seconds: int | None) -> datetime | None:
    if expires_in_seconds is None:
        return None
    seconds = int(expires_in_seconds)
    if seconds <= 0:
        return None
    return datetime.now(UTC) + timedelta(seconds=seconds)


class InvitationRepository(BaseRepository):
    def query_invitations(self, *, organization_id: UUID) -> QuerySet[OrganizationInvitation]:
        return OrganizationInvitation.filter(organization_id=organization_id)

    async def create_invitation(
        self,
        *,
        organization_id: UUID,
        email: str,
        role_code: str | None,
        token_hash: str,
        invited_by_user_id: UUID | None,
        expires_at: datetime | None,
    ) -> OrganizationInvitation:
        return await OrganizationInvitation.create(
            organization_id=organization_id,
            email=email,
            role_code=role_code,
            token_hash=token_hash,
            expires_at=expires_at,
            invited_by_user_id=invited_by_user_id,
        )

    async def get_by_token_hash(self, *, token_hash: str) -> OrganizationInvitation | None:
        return await OrganizationInvitation.get_or_none(token_hash=token_hash).select_related("organization")

    async def revoke_invitation(
        self,
        *,
        organization_id: UUID,
        invitation_id: UUID,
        now: datetime | None = None,
    ) -> int:
        now = now or datetime.now(UTC)
        # Prevent revoking accepted invitations.
        return await OrganizationInvitation.filter(
            id=invitation_id,
            organization_id=organization_id,
            accepted_at=None,
            revoked_at=None,
        ).update(revoked_at=now)

    async def mark_accepted(
        self,
        *,
        invitation_id: UUID,
        accepted_by_user_id: UUID,
        now: datetime | None = None,
    ) -> int:
        now = now or datetime.now(UTC)
        return await OrganizationInvitation.filter(
            id=invitation_id,
            accepted_at=None,
            revoked_at=None,
        ).update(
            accepted_by_user_id=accepted_by_user_id,
            accepted_at=now,
        )

    def apply_filters(
        self,
        *,
        qs: QuerySet[OrganizationInvitation],
        q: str | None,
        status: str | None,
    ) -> QuerySet[OrganizationInvitation]:
        """
        Apply lightweight filters for invitation listing.

        `status` values are expected to be:
        - pending / accepted / revoked / expired
        """

        now = datetime.now(UTC)

        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(Q(email__icontains=needle) | Q(role_code__icontains=needle))

        if status:
            s = status.strip().lower()
            if s == "accepted":
                qs = qs.filter(accepted_at__not_isnull=True)
            elif s == "revoked":
                qs = qs.filter(revoked_at__not_isnull=True)
            elif s == "expired":
                qs = qs.filter(
                    accepted_at=None,
                    revoked_at=None,
                    expires_at__not_isnull=True,
                    expires_at__lte=now,
                )
            elif s == "pending":
                qs = qs.filter(
                    accepted_at=None,
                    revoked_at=None,
                ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))

        return qs
