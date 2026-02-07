from __future__ import annotations

import re
from typing import cast
from uuid import UUID

from tortoise.exceptions import IntegrityError

from apps.api.common.repositories.base import BaseRepository
from apps.api.common.utils.ids import uuid7
from apps.api.modules.organization.models.user import User, UserStatus

from oauth_social.models import OAuthIdentity


def _sanitize_username_base(value: str) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return "user"
    raw = raw.split("@", 1)[0]
    raw = re.sub(r"[^a-z0-9_]+", "_", raw)
    raw = raw.strip("_")
    if not raw:
        return "user"
    return raw[:32]


class OAuthSocialRepository(BaseRepository):
    async def get_identity(self, *, provider: str, subject: str) -> OAuthIdentity | None:
        return await OAuthIdentity.get_or_none(provider=provider, subject=subject)

    async def create_identity(
        self,
        *,
        provider: str,
        subject: str,
        user_id: UUID,
        email: str | None,
    ) -> OAuthIdentity:
        try:
            return await OAuthIdentity.create(
                provider=provider,
                subject=subject,
                user_id=user_id,
                email=email,
            )
        except IntegrityError:
            # Another request may have created it concurrently; return the existing one.
            existing = await OAuthIdentity.get_or_none(provider=provider, subject=subject)
            if existing is not None:
                return existing
            raise

    async def get_user_by_email(self, *, email: str) -> User | None:
        normalized = (email or "").strip().lower()
        if not normalized:
            return None
        return await User.get_or_none(email=normalized)

    async def create_user(
        self,
        *,
        email: str,
        display_name: str | None,
        avatar_url: str | None,
    ) -> User:
        normalized_email = (email or "").strip().lower()
        base = _sanitize_username_base(normalized_email)

        # Retry with suffixes to avoid username collisions.
        for _ in range(10):
            suffix = uuid7().hex[:6]
            username = f"{base}_{suffix}"
            try:
                user = await User.create(
                    username=username,
                    email=normalized_email,
                    status=UserStatus.ACTIVE,
                    display_name=(display_name or "").strip() or None,
                    avatar_url=(avatar_url or "").strip() or None,
                )
                return user
            except IntegrityError:
                continue

        # Last resort: let DB error surface (should be extremely unlikely).
        user = await User.create(
            username=f"user_{uuid7().hex[:12]}",
            email=normalized_email,
            status=UserStatus.ACTIVE,
            display_name=(display_name or "").strip() or None,
            avatar_url=(avatar_url or "").strip() or None,
        )
        return cast(User, user)

