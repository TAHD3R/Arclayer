from __future__ import annotations

import re
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.utils.ids import uuid7
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.auth.oauth_identity import OAuthIdentity
from src.models.organization.user import User, UserStatus


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


class OAuthSocialRepository(TortoiseORMRepository):
    async def get_identity(
        self, *, provider: str, subject: str, conn: BaseDBAsyncClient | None = None
    ) -> OAuthIdentity | None:
        return await self.using_db(OAuthIdentity.filter(provider=provider, subject=subject), conn).first()

    async def get_identity_for_user(
        self, *, user_id: UUID, provider: str, conn: BaseDBAsyncClient | None = None
    ) -> OAuthIdentity | None:
        return await self.using_db(OAuthIdentity.filter(user_id=user_id, provider=provider), conn).first()

    async def create_identity(
        self,
        *,
        provider: str,
        subject: str,
        user_id: UUID,
        email: str | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> OAuthIdentity:
        try:
            return await OAuthIdentity.create(
                provider=provider,
                subject=subject,
                user_id=user_id,
                email=email,
                **self._using_db_kwargs(conn),
            )
        except IntegrityError:
            existing = await self.get_identity(provider=provider, subject=subject, conn=conn)
            if existing is not None:
                return existing
            raise

    async def list_identities_for_user(self, *, user_id: UUID) -> list[OAuthIdentity]:
        return await OAuthIdentity.filter(user_id=user_id).order_by("-created_at").all()

    async def has_identity_for_user(self, *, user_id: UUID) -> bool:
        return await OAuthIdentity.filter(user_id=user_id).exists()

    async def delete_identity_for_user(
        self, *, user_id: UUID, provider: str, conn: BaseDBAsyncClient | None = None
    ) -> int:
        return await self.using_db(OAuthIdentity.filter(user_id=user_id, provider=provider), conn).delete()

    async def delete_identities_for_user(self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None) -> int:
        return await self.using_db(OAuthIdentity.filter(user_id=user_id), conn).delete()

    async def get_user_by_email(self, *, email: str) -> User | None:
        normalized = (email or "").strip().lower()
        if not normalized:
            return None
        return await User.get_or_none(email=normalized)

    async def get_user_by_id(self, *, user_id: UUID) -> User | None:
        return await User.get_or_none(id=user_id)

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

        user = await User.create(
            username=f"user_{uuid7().hex[:12]}",
            email=normalized_email,
            status=UserStatus.ACTIVE,
            display_name=(display_name or "").strip() or None,
            avatar_url=(avatar_url or "").strip() or None,
        )
        return user
