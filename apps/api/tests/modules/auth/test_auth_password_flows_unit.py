from __future__ import annotations

from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import Unauthorized
from src.models.organization.user import UserStatus
from src.modules.auth.contracts.schema import UserLike
from src.modules.auth.service import AuthService
from src.modules.auth.tokens.service import hash_password, verify_password


class _FakeRaw:
    async def sadd(self, key: str, *values: str) -> int:
        return 0

    async def smembers(self, key: str) -> set[str]:
        return set()

    async def srem(self, key: str, *values: str) -> int:
        return 0

    async def expire(self, key: str, ttl: int) -> bool:
        return True


class FakeValkeyClient:
    def __init__(self) -> None:
        self._store: dict[str, Any] = {}
        self.raw = _FakeRaw()

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

    async def smembers(self, key: str) -> set[str]:
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


class FakeUserRepository:
    def __init__(self, user: FakeUser) -> None:
        self._user = user

    async def get_by_identifier(self, identifier: str) -> FakeUser | None:
        return self._user if identifier == self._user.username else None

    async def get_by_id(self, user_id: UUID) -> FakeUser | None:
        return self._user if self._user.id == user_id else None

    async def get_by_id_with_credential(self, user_id: UUID) -> FakeUser | None:
        return await self.get_by_id(user_id)

    async def update_last_login(self, user: UserLike) -> None:
        return None

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


def _build_service(monkeypatch) -> tuple[AuthService, FakeUser]:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()

    user = FakeUser(id=uuid4(), username="demo", email="demo@example.com")
    user.credential = FakeCredential(password_hash=hash_password("oldpass1", settings.auth))

    valkey = FakeValkeyClient()
    repo = FakeUserRepository(user)
    service = AuthService(settings, valkey=valkey, user_repo=repo)
    return service, user


async def test_change_password_success(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    await service.change_password(user_id=user.id, old_password="oldpass1", new_password="newpass1")
    assert user.token_version == 1
    assert user.credential is not None
    assert verify_password("newpass1", user.credential.password_hash, service.settings.auth) is True


async def test_change_password_invalid(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    with pytest.raises(Unauthorized):
        await service.change_password(user_id=user.id, old_password="bad", new_password="newpass1")


async def test_forgot_reset_password(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    issued = await service.forgot_password(identifier=user.username)
    assert issued is not None
    token, _, _recipient, _user_id = issued

    await service.reset_password(reset_token=token, new_password="resetpass1")
    assert user.token_version == 1
    assert user.credential is not None
    assert verify_password("resetpass1", user.credential.password_hash, service.settings.auth) is True
