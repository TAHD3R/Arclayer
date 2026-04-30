from __future__ import annotations

import builtins
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import BadRequest, Unauthorized
from src.models.organization.user import UserStatus
from src.modules.auth.contracts.schema import UserRepositoryLike
from src.modules.auth.login.service import AuthLoginService
from src.modules.auth.service import AuthService
from src.modules.auth.tokens.service import hash_password


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
    """
    Valkey fake that intentionally does NOT delete the 2FA challenge record,
    to simulate a race window where the record is still readable after a successful login.
    """

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
            if key.startswith("auth:2fa:challenge:") and not key.startswith("auth:2fa:challenge:consumed:"):
                continue
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
        return self._user if identifier == self._user.username else None

    async def get_by_email(self, email: str) -> FakeUser | None:
        return self._user if email == self._user.email else None

    async def get_by_id(self, user_id: UUID) -> FakeUser | None:
        return self._user if self._user.id == user_id else None

    async def get_by_id_with_credential(self, user_id: UUID) -> FakeUser | None:
        return await self.get_by_id(user_id)

    async def update_last_login(self, user: Any) -> None:
        user.last_login_at = "updated"

    async def increment_token_version(self, user: Any) -> FakeUser:
        user.token_version += 1
        return user

    def is_active(self, user: Any) -> bool:
        return user.status == UserStatus.ACTIVE

    async def exists_email(self, email: str) -> bool:
        return False

    async def set_password(self, user: Any, password_hash: str) -> None:
        raise RuntimeError("not used")

    async def remove_password(self, user: Any) -> None:
        raise RuntimeError("not used")

    async def exists_username(self, username: str) -> bool:
        return username == self._user.username

    async def set_email(self, user: Any, email: str | None) -> FakeUser:
        user.email = email
        return user

    async def patch_profile(self, user: Any, *, display_name: str | None | object = ...) -> FakeUser:
        if display_name is not ...:
            user.display_name = display_name  # type: ignore[assignment]
        return user

    async def create_user(
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
        is_super_admin: bool = False,
    ) -> FakeUser:
        _ = is_super_admin
        raise RuntimeError("not used")


class FakeTwoFactor:
    async def is_enabled(self, *, user_id: UUID) -> bool:
        return True

    async def verify_for_login(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None:
        if code == "123456":
            return
        raise BadRequest(message="验证码错误", error="TWO_FACTOR_CODE_INVALID")


def _build(monkeypatch) -> tuple[AuthLoginService, FakeValkeyClient]:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()

    user = FakeUser(id=uuid4(), username="demo", email="demo@example.com")
    user.credential = FakeCredential(password_hash=hash_password("pass", settings.auth))

    valkey = FakeValkeyClient()
    repo = FakeUserRepository(user)
    auth = AuthService(settings, valkey=valkey, user_repo=cast(UserRepositoryLike, repo))
    return (
        AuthLoginService(settings, valkey=valkey, auth_service=auth, two_factor=FakeTwoFactor()),
        valkey,
    )


async def test_two_factor_challenge_cannot_be_reused_even_if_record_still_exists(monkeypatch) -> None:
    service, valkey = _build(monkeypatch)

    with pytest.raises(Unauthorized) as exc:
        await service.login(email="demo@example.com", password="pass")

    assert exc.value.meta is not None
    token = str(exc.value.meta["two_factor_token"])

    tokens = await service.complete_two_factor_login(two_factor_token=token, code="123456", backup_code=None)
    assert tokens.refresh_token

    # Simulated race: record wasn't deleted by the fake.
    assert f"auth:2fa:challenge:{token}" in valkey._store

    refresh_keys_before = [k for k in valkey._store.keys() if k.startswith("auth:refresh:")]

    with pytest.raises(Unauthorized) as reused:
        await service.complete_two_factor_login(two_factor_token=token, code="123456", backup_code=None)

    assert reused.value.error == "TWO_FACTOR_CHALLENGE_INVALID"

    refresh_keys_after = [k for k in valkey._store.keys() if k.startswith("auth:refresh:")]
    assert len(refresh_keys_after) == len(refresh_keys_before)

    # Ensure the consumed marker was written.
    assert f"auth:2fa:challenge:consumed:{token}" in valkey._store
