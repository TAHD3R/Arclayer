from __future__ import annotations

import builtins
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from src.common.constants.auth import REFRESH_STATUS_REVOKED, REFRESH_STATUS_ROTATED
from src.config import get_settings
from src.core.exceptions import Unauthorized
from src.models.organization.user import UserStatus
from src.modules.auth.contracts.schema import UserLike
from src.modules.auth.service import AuthService
from src.modules.auth.tokens.service import decode_token, hash_password


class _FakeRaw:
    def __init__(self, sets: dict[str, set[str]]) -> None:
        self._sets = sets

    async def sadd(self, key: str, *values: str) -> int:
        bucket = self._sets.setdefault(key, set())
        before = len(bucket)
        bucket.update(values)
        return len(bucket) - before

    async def smembers(self, key: str) -> builtins.set[str]:
        return set(self._sets.get(key, set()))

    async def srem(self, key: str, *values: str) -> int:
        bucket = self._sets.get(key, set())
        removed = 0
        for value in values:
            if value in bucket:
                bucket.remove(value)
                removed += 1
        return removed

    async def expire(self, key: str, ttl: int) -> bool:
        return True


class FakeValkeyClient:
    def __init__(self) -> None:
        self._store: dict[str, Any] = {}
        self._sets: dict[str, set[str]] = {}
        self.raw = _FakeRaw(self._sets)

    def key(self, *parts: str) -> str:
        return ":".join(parts)

    async def set_json(
        self,
        key: str,
        data: Any,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool:
        self._store[key] = data
        return True

    async def get_json(self, key: str) -> Any:
        return self._store.get(key)

    async def set(
        self,
        key: str,
        value: str,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        xx: bool | None = None,
    ) -> bool:
        self._store[key] = value
        return True

    async def get(self, key: str) -> str | None:
        value = self._store.get(key)
        return value if isinstance(value, str) else None

    async def ttl(self, key: str) -> int:
        return 0

    async def delete(self, *keys: str) -> int:
        removed = 0
        for key in keys:
            if key in self._store:
                del self._store[key]
                removed += 1
        return removed

    async def sadd(self, key: str, *members: str) -> int:
        return await self.raw.sadd(key, *members)

    async def smembers(self, key: str) -> builtins.set[str]:
        return await self.raw.smembers(key)

    async def srem(self, key: str, *members: str) -> int:
        return await self.raw.srem(key, *members)

    async def expire(self, key: str, seconds: int) -> bool:
        return await self.raw.expire(key, seconds)


class FakeCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password_hash: str


class FakeUser(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    username: str
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    status: UserStatus = UserStatus.ACTIVE
    token_version: int = 0
    credential: FakeCredential | None = None
    last_login_at: Any | None = None


class FakeUserRepository:
    def __init__(self, user: FakeUser) -> None:
        self._user = user

    async def get_by_identifier(self, identifier: str) -> FakeUser | None:
        if identifier == self._user.username:
            return self._user
        return None

    async def get_by_id(self, user_id: UUID) -> FakeUser | None:
        return self._user if self._user.id == user_id else None

    async def get_by_id_with_credential(self, user_id: UUID) -> FakeUser | None:
        return await self.get_by_id(user_id)

    async def update_last_login(self, user: UserLike) -> None:
        record = cast(FakeUser, user)
        record.last_login_at = "updated"

    async def increment_token_version(self, user: UserLike) -> FakeUser:
        record = cast(FakeUser, user)
        record.token_version += 1
        return record

    def is_active(self, user: UserLike) -> bool:
        record = cast(FakeUser, user)
        return record.status == UserStatus.ACTIVE

    async def set_password(self, user: UserLike, password_hash: str) -> None:
        record = cast(FakeUser, user)
        if record.credential is None:
            record.credential = FakeCredential(password_hash=password_hash)
        else:
            record.credential.password_hash = password_hash

    async def exists_username(self, username: str) -> bool:
        return username == self._user.username

    async def exists_email(self, email: str) -> bool:
        return False

    async def set_email(self, user: UserLike, email: str | None) -> FakeUser:
        record = cast(FakeUser, user)
        record.email = email
        return record

    async def patch_profile(
        self,
        user: UserLike,
        *,
        display_name: str | None | object = ...,
    ) -> FakeUser:
        record = cast(FakeUser, user)
        if display_name is not ...:
            record.display_name = cast(str | None, display_name)
        return record

    async def create_user(
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
    ) -> FakeUser:
        raise RuntimeError("not used")


def _build_service(monkeypatch) -> tuple[AuthService, FakeValkeyClient, FakeUser]:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()

    user = FakeUser(id=uuid4(), username="demo")
    user.credential = FakeCredential(password_hash=hash_password("pass", settings.auth))

    valkey = FakeValkeyClient()
    repo = FakeUserRepository(user)
    service = AuthService(settings, valkey=valkey, user_repo=repo)
    return service, valkey, user


async def test_refresh_rotation_and_reuse_detection(monkeypatch) -> None:
    service, _, user = _build_service(monkeypatch)

    tokens = await service.login(identifier="demo", password="pass")
    first_refresh = tokens.refresh_token

    rotated = await service.refresh(refresh_token=first_refresh)
    assert rotated.refresh_token != first_refresh

    payload = decode_token(first_refresh, service.settings.auth)
    first_sid = payload.get("sid")
    assert isinstance(first_sid, str)
    rotated_payload = decode_token(rotated.refresh_token, service.settings.auth)
    assert rotated_payload.get("sid") == first_sid

    assert service.refresh_store is not None
    jti = payload.get("jti")
    assert isinstance(jti, str)
    record = await service.refresh_store.get(jti)
    assert record is not None
    assert record["status"] == REFRESH_STATUS_ROTATED

    with pytest.raises(Unauthorized) as exc:
        await service.refresh(refresh_token=first_refresh)

    assert exc.value.error == "TOKEN_REUSED"
    assert user.token_version == 1


async def test_logout_revokes_current_refresh_token(monkeypatch) -> None:
    service, _, user = _build_service(monkeypatch)

    tokens = await service.login(identifier="demo", password="pass")
    await service.logout(user_id=user.id, refresh_token=tokens.refresh_token)

    assert user.token_version == 0
    assert service.refresh_store is not None
    assert await service.refresh_store.list_active(user.id) == []

    payload = decode_token(tokens.refresh_token, service.settings.auth)
    jti = payload.get("jti")
    assert isinstance(jti, str)
    record = await service.refresh_store.get(jti)
    assert record is not None
    assert record["status"] == REFRESH_STATUS_REVOKED

    with pytest.raises(Unauthorized) as exc:
        await service.refresh(refresh_token=tokens.refresh_token)

    assert exc.value.error == "REFRESH_REVOKED"
    assert user.token_version == 0


async def test_logout_all_bumps_token_version(monkeypatch) -> None:
    service, _, user = _build_service(monkeypatch)

    tokens = await service.login(identifier="demo", password="pass")
    await service.logout_all(user_id=user.id)

    assert user.token_version == 1
    with pytest.raises(Unauthorized) as exc:
        await service.refresh(refresh_token=tokens.refresh_token)

    assert exc.value.error == "TOKEN_STALE"
