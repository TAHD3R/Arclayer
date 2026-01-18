from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

import pytest

from apps.api.config import get_settings
from apps.api.core.exceptions import Unauthorized
from apps.api.models.user import UserStatus
from apps.api.routers.v1.auth.constants import REFRESH_STATUS_ROTATED
from apps.api.routers.v1.auth.security import decode_token, hash_password
from apps.api.routers.v1.auth.services import AuthService


class _FakeRaw:
    def __init__(self, sets: dict[str, set[str]]) -> None:
        self._sets = sets

    async def sadd(self, key: str, *values: str) -> int:
        bucket = self._sets.setdefault(key, set())
        before = len(bucket)
        bucket.update(values)
        return len(bucket) - before

    async def smembers(self, key: str) -> set[str]:
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

    async def update_last_login(self, user: FakeUser) -> None:
        user.last_login_at = "updated"

    async def increment_token_version(self, user: FakeUser) -> FakeUser:
        user.token_version += 1
        return user

    def is_active(self, user: FakeUser) -> bool:
        return user.status == UserStatus.ACTIVE


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
    record = await service.refresh_store.get(payload["jti"])
    assert record["status"] == REFRESH_STATUS_ROTATED

    with pytest.raises(Unauthorized) as exc:
        await service.refresh(refresh_token=first_refresh)

    assert exc.value.error == "TOKEN_REUSED"
    assert user.token_version == 1


async def test_logout_bumps_token_version(monkeypatch) -> None:
    service, _, user = _build_service(monkeypatch)

    tokens = await service.login(identifier="demo", password="pass")
    await service.logout(user_id=user.id, refresh_token=None)

    assert user.token_version == 1
    with pytest.raises(Unauthorized) as exc:
        await service.refresh(refresh_token=tokens.refresh_token)

    assert exc.value.error == "TOKEN_STALE"
