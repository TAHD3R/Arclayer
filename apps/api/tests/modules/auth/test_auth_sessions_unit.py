from __future__ import annotations

from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from apps.api.src.config import get_settings
from apps.api.src.models.organization.user import UserStatus
from apps.api.src.modules.auth.contracts.schema import UserLike
from apps.api.src.modules.auth.service import AuthService
from apps.api.src.modules.auth.sessions.service import AuthSessionService
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

    async def get(self, key: str) -> str | None:
        value = self._store.get(key)
        return value if isinstance(value, str) else None

    async def set(self, key: str, value: str, *, ex: int | None = None, nx=None, xx=None) -> bool:  # type: ignore[no-untyped-def]
        self._store[key] = value
        return True

    async def set_json(self, key: str, data: Any, *, ex: int | None = None, nx=None, xx=None) -> bool:  # type: ignore[no-untyped-def]
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

    async def exists_username(self, username: str) -> bool:
        return username == self._user.username

    async def exists_email(self, email: str) -> bool:
        return False

    async def set_password(self, user: UserLike, password_hash: str) -> None:
        record = cast(FakeUser, user)
        if record.credential is None:
            record.credential = FakeCredential(password_hash=password_hash)
        else:
            record.credential.password_hash = password_hash

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
        self, *, username: str, email: str | None, display_name: str | None, password_hash: str
    ) -> FakeUser:  # type: ignore[no-untyped-def]
        raise RuntimeError("not used")


def _get_refresh_record(valkey: FakeValkeyClient, *, jti: str) -> dict[str, Any]:
    record = valkey._store.get(f"auth:refresh:{jti}")
    assert isinstance(record, dict)
    return record


def _build(monkeypatch) -> tuple[AuthService, AuthSessionService, FakeValkeyClient, FakeUser]:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()

    user = FakeUser(id=uuid4(), username="demo")
    user.credential = FakeCredential(password_hash=hash_password("pass", settings.auth))

    valkey = FakeValkeyClient()
    repo = FakeUserRepository(user)
    auth = AuthService(settings, valkey=valkey, user_repo=repo)
    sessions = AuthSessionService(settings, valkey=valkey)
    return auth, sessions, valkey, user


async def test_session_list_and_revoke(monkeypatch) -> None:
    auth, sessions, _, user = _build(monkeypatch)

    a = await auth.login(identifier="demo", password="pass")
    b = await auth.login(identifier="demo", password="pass")

    a_sid = decode_token(a.access_token, auth.settings.auth).get("sid")
    assert isinstance(a_sid, str)

    listed = await sessions.list_sessions(user_id=user.id, current_session_id=a_sid)
    assert listed.total == 2
    assert len(listed.items) == 2
    assert sum(1 for s in listed.items if s.current) == 1
    assert any(s.current and s.session_id == a_sid for s in listed.items)

    # Revoke one specific session (pick the other).
    other_sid = decode_token(b.access_token, auth.settings.auth).get("sid")
    assert isinstance(other_sid, str)
    await sessions.revoke_session(user_id=user.id, session_id=other_sid)

    listed2 = await sessions.list_sessions(user_id=user.id, current_session_id=a_sid)
    assert listed2.total == 1
    assert listed2.items[0].session_id == a_sid


async def test_revoke_other_sessions(monkeypatch) -> None:
    auth, sessions, _, user = _build(monkeypatch)

    a = await auth.login(identifier="demo", password="pass")
    _ = await auth.login(identifier="demo", password="pass")
    _ = await auth.login(identifier="demo", password="pass")

    a_sid = decode_token(a.access_token, auth.settings.auth).get("sid")
    assert isinstance(a_sid, str)

    revoked = await sessions.revoke_other_sessions(user_id=user.id, current_session_id=a_sid)
    assert revoked == 2
    listed = await sessions.list_sessions(user_id=user.id, current_session_id=a_sid)
    assert listed.total == 1
    assert listed.items[0].session_id == a_sid


async def test_login_persists_session_metadata(monkeypatch) -> None:
    auth, _, valkey, user = _build(monkeypatch)

    try:
        from apps.api.src.modules.auth.sessions.request_context import AuthRequestContext
    except ModuleNotFoundError as exc:
        pytest.fail(f"missing auth request context module: {exc}")

    request_context = AuthRequestContext(
        ip_address="203.0.113.8",
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        ),
    )

    try:
        tokens = await auth.issue_token_pair_for_user(
            user.id,
            request_context=request_context,
            auth_method="password",
        )
    except TypeError as exc:
        pytest.fail(f"missing metadata-aware token issuing signature: {exc}")

    refresh_payload = decode_token(tokens.refresh_token, auth.settings.auth)
    refresh_jti = refresh_payload.get("jti")
    assert isinstance(refresh_jti, str)

    record = _get_refresh_record(valkey, jti=refresh_jti)

    assert record["user_id"] == str(user.id)
    assert record["ip_address"] == "203.0.113.8"
    assert record["user_agent"].startswith("Mozilla/5.0")
    assert record["auth_method"] == "password"
