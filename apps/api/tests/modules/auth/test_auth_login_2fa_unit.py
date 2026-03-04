from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from apps.api.src.config import get_settings
from apps.api.src.core.exceptions import BadRequest, Unauthorized
from apps.api.src.models.organization.user import UserStatus
from apps.api.src.modules.auth.login.service import AuthLoginService
from apps.api.src.modules.auth.service import AuthService
from apps.api.src.modules.auth.tokens.service import decode_token, hash_password


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
        exists = key in self._store
        if nx and exists:
            return False
        if xx and not exists:
            return False
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
        exists = key in self._store
        if nx and exists:
            return False
        if xx and not exists:
            return False
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
    last_login_at: Any | None = None


class FakeUserRepository:
    def __init__(self, user: FakeUser) -> None:
        self._user = user

    async def get_by_identifier(self, identifier: str) -> FakeUser | None:
        return self._user if identifier == self._user.username else None

    async def get_by_id(self, user_id: UUID) -> FakeUser | None:
        return self._user if self._user.id == user_id else None

    async def get_by_id_with_credential(self, user_id: UUID) -> FakeUser | None:
        return await self.get_by_id(user_id)

    async def update_last_login(self, user) -> None:
        user.last_login_at = "updated"

    async def increment_token_version(self, user) -> FakeUser:
        user.token_version += 1
        return user

    def is_active(self, user) -> bool:
        return user.status == UserStatus.ACTIVE

    async def set_password(self, user, password_hash: str) -> None:
        if user.credential is None:
            user.credential = FakeCredential(password_hash=password_hash)
        else:
            user.credential.password_hash = password_hash

    async def exists_username(self, username: str) -> bool:
        return username == self._user.username

    async def exists_email(self, email: str) -> bool:
        return False

    async def set_email(self, user, email: str | None) -> FakeUser:
        user.email = email
        return user

    async def patch_profile(self, user, *, display_name: str | None | object = ...) -> FakeUser:
        if display_name is not ...:
            user.display_name = display_name
        return user

    async def create_user(
        self, *, username: str, email: str | None, display_name: str | None, password_hash: str
    ) -> FakeUser:
        raise RuntimeError("not used")


class FakeTwoFactor:
    def __init__(self, *, enabled: bool, ok_code: str = "123456") -> None:
        self._enabled = enabled
        self._ok_code = ok_code

    async def is_enabled(self, *, user_id: UUID) -> bool:
        return self._enabled

    async def verify_for_login(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None:
        if code == self._ok_code:
            return
        raise BadRequest(message="验证码错误", error="TWO_FACTOR_CODE_INVALID")


def _build_login_service(
    monkeypatch, *, two_factor_enabled: bool
) -> tuple[AuthLoginService, FakeValkeyClient, FakeUser]:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()

    user = FakeUser(id=uuid4(), username="demo")
    user.credential = FakeCredential(password_hash=hash_password("pass", settings.auth))

    valkey = FakeValkeyClient()
    repo = FakeUserRepository(user)
    auth = AuthService(settings, valkey=valkey, user_repo=repo)

    two_factor = FakeTwoFactor(enabled=two_factor_enabled)
    login = AuthLoginService(settings, valkey=valkey, auth_service=auth, two_factor=two_factor)
    return login, valkey, user


async def test_login_returns_two_factor_challenge(monkeypatch) -> None:
    service, _, _ = _build_login_service(monkeypatch, two_factor_enabled=True)

    with pytest.raises(Unauthorized) as exc:
        await service.login(identifier="demo", password="pass")

    assert exc.value.error == "TWO_FACTOR_REQUIRED"
    assert isinstance(exc.value.meta, dict)
    assert isinstance(exc.value.meta.get("two_factor_token"), str)
    assert isinstance(exc.value.meta.get("expires_in"), int)


async def test_complete_two_factor_login_issues_tokens(monkeypatch) -> None:
    service, valkey, user = _build_login_service(monkeypatch, two_factor_enabled=True)

    with pytest.raises(Unauthorized) as exc:
        await service.login(identifier="demo", password="pass")

    assert exc.value.meta is not None
    token = str(exc.value.meta["two_factor_token"])
    tokens = await service.complete_two_factor_login(two_factor_token=token, code="123456", backup_code=None)
    assert tokens.access_token
    assert tokens.refresh_token

    refresh_payload = decode_token(tokens.refresh_token, service.settings.auth)
    jti = refresh_payload.get("jti")
    assert isinstance(jti, str)
    assert f"auth:refresh:{jti}" in valkey._store

    assert UUID(str(refresh_payload.get("sub"))) == user.id


async def test_complete_two_factor_login_bumps_attempts(monkeypatch) -> None:
    service, valkey, _ = _build_login_service(monkeypatch, two_factor_enabled=True)

    with pytest.raises(Unauthorized) as exc:
        await service.login(identifier="demo", password="pass")

    assert exc.value.meta is not None
    token = str(exc.value.meta["two_factor_token"])
    with pytest.raises(Unauthorized) as invalid:
        await service.complete_two_factor_login(two_factor_token=token, code="000000", backup_code=None)

    assert invalid.value.error == "TWO_FACTOR_CODE_INVALID"
    record = valkey._store.get(f"auth:2fa:challenge:{token}")
    assert isinstance(record, dict)
    assert int(record.get("attempts") or 0) == 1
