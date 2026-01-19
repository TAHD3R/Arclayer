from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

import pytest

from apps.api.config import get_settings
from apps.api.core.exceptions import Unauthorized
from apps.api.models.user import UserStatus
from apps.api.routers.v1.auth.security import hash_password, verify_password
from apps.api.routers.v1.auth.services import AuthService


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


@dataclass
class FakeCredential:
    password_hash: str


@dataclass
class FakeUser:
    id: UUID
    username: str
    email: str | None = None
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

    async def update_last_login(self, user: FakeUser) -> None:
        return None

    async def increment_token_version(self, user: FakeUser) -> FakeUser:
        user.token_version += 1
        return user

    def is_active(self, user: FakeUser) -> bool:
        return user.status == UserStatus.ACTIVE

    async def set_password(self, user: FakeUser, password_hash: str) -> None:
        if user.credential is None:
            user.credential = FakeCredential(password_hash=password_hash)
        else:
            user.credential.password_hash = password_hash

    async def exists_username(self, username: str) -> bool:
        return username == self._user.username

    async def exists_email(self, email: str) -> bool:
        return False

    async def create_user(self, **kwargs):
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
    assert verify_password("resetpass1", user.credential.password_hash, service.settings.auth) is True
