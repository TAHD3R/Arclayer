from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from tortoise.expressions import Q

from apps.api.common.repositories import BaseRepository
from apps.api.config import AuthSettings
from apps.api.core.database.valkey import ValkeyClient
from apps.api.models.user import User, UserCredential, UserStatus
from apps.api.routers.v1.auth.constants import (
    REFRESH_STATUS_REVOKED,
    REFRESH_STATUS_ROTATED,
)


class UserRepository(BaseRepository):
    def _is_phone_identifier(self, identifier: str) -> bool:
        raw = identifier.strip()
        if raw.startswith("+"):
            raw = raw[1:]
        return raw.isdigit() and len(raw) <= 32

    async def get_by_identifier(self, identifier: str) -> User | None:
        identifier = identifier.strip()
        filters = Q()
        if identifier and len(identifier) <= 64:
            filters |= Q(username=identifier)
        if "@" in identifier and len(identifier) <= 255:
            filters |= Q(email=identifier)
        if self._is_phone_identifier(identifier):
            filters |= Q(phone=identifier)
        if not filters:
            return None
        return await User.get_or_none(filters).prefetch_related("credential")

    async def get_by_id(self, user_id: UUID) -> User | None:
        return await User.get_or_none(id=user_id)

    async def get_by_id_with_credential(self, user_id: UUID) -> User | None:
        return await User.get_or_none(id=user_id).prefetch_related("credential")

    async def update_last_login(self, user: User) -> None:
        user.last_login_at = datetime.now(UTC)
        await user.save(update_fields=["last_login_at"])

    async def increment_token_version(self, user: User) -> User:
        user.token_version = (user.token_version or 0) + 1
        await user.save(update_fields=["token_version"])
        return user

    def is_active(self, user: User) -> bool:
        return user.status == UserStatus.ACTIVE

    async def exists_username(self, username: str) -> bool:
        return await User.filter(username=username).exists()

    async def exists_email(self, email: str) -> bool:
        return await User.filter(email=email).exists()

    async def exists_phone(self, phone: str) -> bool:
        return await User.filter(phone=phone).exists()

    async def create_user(
        self,
        *,
        username: str,
        email: str | None,
        phone: str | None,
        display_name: str | None,
        password_hash: str,
    ) -> User:
        user = await User.create(
            username=username,
            email=email,
            phone=phone,
            status=UserStatus.ACTIVE,
            display_name=display_name,
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=password_hash)
        return user

    async def set_password(self, user: User, password_hash: str) -> None:
        credential = await UserCredential.get_or_none(user_id=user.id)
        if credential is None:
            await UserCredential.create(user=user, password_hash=password_hash)
            return
        credential.password_hash = password_hash
        credential.password_updated_at = datetime.now(UTC)
        await credential.save(update_fields=["password_hash", "password_updated_at"])


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


class PasswordResetStore:
    def __init__(self, client: ValkeyClient, settings: AuthSettings) -> None:
        self._client = client
        self._settings = settings

    def _token_key(self, token: str) -> str:
        return f"auth:reset:{token}"

    def _user_key(self, user_id: UUID) -> str:
        return f"auth:reset:user:{user_id}"

    async def issue(self, user_id: UUID) -> tuple[str, int]:
        ttl = max(self._settings.reset_token_ttl_seconds, 1)
        existing = await self._client.get(self._user_key(user_id))
        if existing:
            await self._client.delete(self._token_key(existing))

        token = uuid4().hex
        now_ts = int(datetime.now(UTC).timestamp())
        record = {
            "user_id": str(user_id),
            "issued_at": now_ts,
            "expires_at": now_ts + ttl,
        }
        await self._client.set_json(self._token_key(token), record, ex=ttl)
        await self._client.set(self._user_key(user_id), token, ex=ttl)
        return token, ttl

    async def consume(self, token: str) -> dict[str, Any] | None:
        record = await self._client.get_json(self._token_key(token))
        if not isinstance(record, dict):
            return None
        await self._client.delete(self._token_key(token))
        user_id = record.get("user_id")
        if user_id:
            user_uuid = UUID(str(user_id))
            current = await self._client.get(self._user_key(user_uuid))
            if current == token:
                await self._client.delete(self._user_key(user_uuid))
        return record
