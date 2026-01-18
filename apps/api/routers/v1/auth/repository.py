from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from tortoise.expressions import Q

from apps.api.common.bases import BaseRepository
from apps.api.config import AuthSettings
from apps.api.core.database.valkey import ValkeyClient
from apps.api.models.user import User, UserStatus
from apps.api.routers.v1.auth.constants import (
    REFRESH_STATUS_REVOKED,
    REFRESH_STATUS_ROTATED,
)


class UserRepository(BaseRepository):
    async def get_by_identifier(self, identifier: str) -> User | None:
        return await User.get_or_none(
            Q(username=identifier) | Q(email=identifier) | Q(phone=identifier)
        ).prefetch_related("credential")

    async def get_by_id(self, user_id: UUID) -> User | None:
        return await User.get_or_none(id=user_id)

    async def update_last_login(self, user: User) -> None:
        user.last_login_at = datetime.now(UTC)
        await user.save(update_fields=["last_login_at"])

    async def increment_token_version(self, user: User) -> User:
        user.token_version = (user.token_version or 0) + 1
        await user.save(update_fields=["token_version"])
        return user

    def is_active(self, user: User) -> bool:
        return user.status == UserStatus.ACTIVE


class RefreshTokenStore:
    def __init__(self, client: ValkeyClient, settings: AuthSettings) -> None:
        self._client = client
        self._settings = settings

    def _refresh_key(self, jti: str) -> str:
        return f"auth:refresh:{jti}"

    def _refresh_key_full(self, jti: str) -> str:
        return self._client.key("auth", "refresh", jti)

    def _user_set_key(self, user_id: UUID) -> str:
        return f"auth:user:{user_id}:refresh"

    def _user_set_key_full(self, user_id: UUID) -> str:
        return self._client.key("auth", "user", str(user_id), "refresh")

    async def store(self, record: dict[str, Any], *, ttl: int) -> None:
        key = self._refresh_key(record["jti"])
        await self._client.set_json(key, record, ex=ttl)
        set_key = self._user_set_key_full(record["user_id"])
        await self._client.raw.sadd(set_key, record["jti"])
        if ttl > 0:
            await self._client.raw.expire(set_key, ttl)

    async def get(self, jti: str) -> dict[str, Any] | None:
        data = await self._client.get_json(self._refresh_key(jti))
        return data if isinstance(data, dict) else None

    async def update(self, jti: str, record: dict[str, Any]) -> None:
        ttl = await self._client.ttl(self._refresh_key(jti))
        ex = ttl if ttl and ttl > 0 else None
        await self._client.set_json(self._refresh_key(jti), record, ex=ex)

    async def mark_rotated(self, jti: str, *, replaced_by: str) -> None:
        record = await self.get(jti)
        if not record:
            return
        record["status"] = REFRESH_STATUS_ROTATED
        record["replaced_by"] = replaced_by
        record["rotated_at"] = int(datetime.now(UTC).timestamp())
        await self.update(jti, record)
        await self._client.raw.srem(self._user_set_key_full(record["user_id"]), jti)

    async def revoke(self, jti: str) -> None:
        record = await self.get(jti)
        if not record:
            return
        record["status"] = REFRESH_STATUS_REVOKED
        record["revoked_at"] = int(datetime.now(UTC).timestamp())
        await self.update(jti, record)
        await self._client.raw.srem(self._user_set_key_full(record["user_id"]), jti)

    async def list_active(self, user_id: UUID) -> list[str]:
        members = await self._client.raw.smembers(self._user_set_key_full(user_id))
        if not members:
            return []
        return sorted(members)

    async def revoke_all(self, user_id: UUID) -> None:
        jtis = await self.list_active(user_id)
        for jti in jtis:
            await self._client.delete(self._refresh_key(jti))
        await self._client.delete(self._user_set_key(user_id))
