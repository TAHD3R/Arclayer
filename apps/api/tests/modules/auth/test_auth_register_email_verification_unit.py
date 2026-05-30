from __future__ import annotations

import builtins
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import BadRequest
from src.models.organization.user import UserStatus
from src.modules.auth.contracts.schema import UserLike, UserRepositoryLike
from src.modules.auth.service import AuthService


class _FakeRaw:
    async def sadd(self, key: str, *values: str) -> int:
        _ = key, values
        return 0

    async def smembers(self, key: str) -> builtins.set[str]:
        _ = key
        return set()

    async def srem(self, key: str, *values: str) -> int:
        _ = key, values
        return 0

    async def expire(self, key: str, ttl: int) -> bool:
        _ = key, ttl
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
        _ = ex
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
        _ = ex
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
        _ = key
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
    avatar_asset_id: UUID | None = None
    status: UserStatus = UserStatus.ACTIVE
    token_version: int = 0
    credential: FakeCredential | None = None
    last_login_at: Any | None = None
    email_verified_at: Any | None = None
    deleted: bool = False


class FakeUserRepository:
    def __init__(self) -> None:
        self.users: list[FakeUser] = []

    async def get_by_identifier(self, identifier: str) -> FakeUser | None:
        return next((user for user in self.users if user.username == identifier or user.email == identifier), None)

    async def get_by_email(self, email: str) -> FakeUser | None:
        return next((user for user in self.users if user.email == email and not user.deleted), None)

    async def get_by_id(self, user_id: UUID) -> FakeUser | None:
        return next((user for user in self.users if user.id == user_id and not user.deleted), None)

    async def get_by_id_with_credential(self, user_id: UUID) -> FakeUser | None:
        return await self.get_by_id(user_id)

    async def get_by_id_with_credential_in_connection(self, user_id: UUID, *, conn: object) -> FakeUser | None:
        _ = conn
        return await self.get_by_id(user_id)

    async def update_last_login(self, user: UserLike) -> None:
        cast(FakeUser, user).last_login_at = "updated"

    async def update_last_login_in_connection(self, user: UserLike, *, conn: object) -> None:
        _ = conn
        await self.update_last_login(user)

    async def increment_token_version(self, user: UserLike) -> FakeUser:
        record = cast(FakeUser, user)
        record.token_version += 1
        return record

    async def increment_token_version_in_connection(self, user: UserLike, *, conn: object) -> FakeUser:
        _ = conn
        return await self.increment_token_version(user)

    def is_active(self, user: UserLike) -> bool:
        return cast(FakeUser, user).status == UserStatus.ACTIVE

    async def set_password(self, user: UserLike, password_hash: str) -> None:
        cast(FakeUser, user).credential = FakeCredential(password_hash=password_hash)

    async def set_password_in_connection(
        self,
        user: UserLike,
        *,
        password_hash: str,
        conn: object,
    ) -> None:
        _ = conn
        await self.set_password(user, password_hash)

    async def remove_password(self, user: UserLike) -> None:
        cast(FakeUser, user).credential = None

    async def remove_password_in_connection(self, user: UserLike, *, conn: object) -> None:
        _ = conn
        await self.remove_password(user)

    async def exists_username(self, username: str) -> bool:
        return any(user.username == username and not user.deleted for user in self.users)

    async def exists_email(self, email: str) -> bool:
        return any(user.email == email and not user.deleted for user in self.users)

    async def set_email(self, user: UserLike, email: str | None) -> FakeUser:
        record = cast(FakeUser, user)
        record.email = email
        record.email_verified_at = "verified" if email else None
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
        is_super_admin: bool = False,
        email_verified_at: Any | None = None,
    ) -> FakeUser:
        _ = is_super_admin
        user = FakeUser(
            id=uuid4(),
            username=username,
            email=email,
            display_name=display_name,
            credential=FakeCredential(password_hash=password_hash),
            email_verified_at=email_verified_at,
        )
        self.users.append(user)
        return user

    async def mark_email_verified(self, user: UserLike) -> FakeUser:
        record = cast(FakeUser, user)
        record.email_verified_at = "verified"
        return record

    async def set_email_verified_at(self, user: UserLike, verified_at: Any | None) -> FakeUser:
        record = cast(FakeUser, user)
        record.email_verified_at = verified_at
        return record

    async def delete_user(self, user: UserLike) -> None:
        cast(FakeUser, user).deleted = True


class FakeOnboardingService:
    async def ensure_initialized(self, *, user_id: UUID) -> None:
        _ = user_id


def _verification_policy(enabled: bool = True):
    class Policy:
        require_email = False
        require_email_verification = True
        email_domains_allowlist = frozenset()

        def __init__(self) -> None:
            self.enabled = enabled

        def is_email_allowed(self, email: str | None) -> bool:
            _ = email
            return True

    return Policy()


def _build_service(monkeypatch) -> tuple[AuthService, FakeValkeyClient, FakeUserRepository]:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    valkey = FakeValkeyClient()
    repo = FakeUserRepository()
    service = AuthService(
        settings,
        valkey=cast(Any, valkey),
        user_repo=cast(UserRepositoryLike, repo),
        onboarding_service=cast(Any, FakeOnboardingService()),
    )
    return service, valkey, repo


async def _email_enabled() -> bool:
    return True


async def _email_disabled() -> bool:
    return False


async def _get_verification_policy(_settings):
    return _verification_policy()


async def test_register_public_requires_email_verification_and_sends_mail(monkeypatch) -> None:
    service, valkey, repo = _build_service(monkeypatch)
    sent: list[dict[str, object]] = []

    monkeypatch.setattr(
        "src.modules.auth.registration.service.get_public_register_policy",
        _get_verification_policy,
    )
    monkeypatch.setattr(service.email_service, "is_enabled", _email_enabled)

    async def _fake_send(**kwargs: object) -> None:
        sent.append(kwargs)

    monkeypatch.setattr(service, "send_registration_verification_email", _fake_send)

    result = await service.register_public(
        password="pass1234",
        email="New-User@Example.COM",
    )

    assert result.requires_email_verification is True
    assert result.retry_after == 60
    assert result.expires_in == 3600
    assert result.user.email == "new-user@example.com"
    assert result.user.username == "new-user"
    assert result.user.display_name is None
    assert len(repo.users) == 1
    assert repo.users[0].email_verified_at is None
    assert sent[0]["recipient"] == "new-user@example.com"
    assert isinstance(sent[0]["verification_token"], str)
    assert "auth:registration_email_verification:email:new-user@example.com" in valkey._store


async def test_register_public_generates_collision_safe_username(monkeypatch) -> None:
    service, _valkey, repo = _build_service(monkeypatch)

    monkeypatch.setattr(
        "src.modules.auth.registration.service.get_public_register_policy",
        _get_verification_policy,
    )
    monkeypatch.setattr(service.email_service, "is_enabled", _email_enabled)

    async def _fake_send(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr(service, "send_registration_verification_email", _fake_send)

    first = await service.register_public(password="pass1234", email="New-User@Example.COM")
    second = await service.register_public(password="pass1234", email="new-user@other.example")

    assert first.user.username == "new-user"
    assert second.user.username.startswith("new-user-")
    assert second.user.username != first.user.username
    assert len(repo.users) == 2


async def test_register_public_fails_when_mail_disabled_without_creating_user(monkeypatch) -> None:
    service, valkey, repo = _build_service(monkeypatch)

    monkeypatch.setattr(
        "src.modules.auth.registration.service.get_public_register_policy",
        _get_verification_policy,
    )
    monkeypatch.setattr(service.email_service, "is_enabled", _email_disabled)

    with pytest.raises(BadRequest) as exc:
        await service.register_public(password="pass1234", email="new@example.com")

    assert exc.value.error == "MAIL_DISABLED"
    assert repo.users == []


async def test_confirm_registration_email_verification_marks_user_verified(monkeypatch) -> None:
    service, valkey, repo = _build_service(monkeypatch)

    monkeypatch.setattr(
        "src.modules.auth.registration.service.get_public_register_policy",
        _get_verification_policy,
    )
    monkeypatch.setattr(service.email_service, "is_enabled", _email_enabled)

    async def _fake_send(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr(service, "send_registration_verification_email", _fake_send)

    result = await service.register_public(password="pass1234", email="new@example.com")
    token = next(
        str(record["token"])
        for key, record in valkey._store.items()
        if key.startswith("auth:registration_email_verification:token:") and isinstance(record, dict)
    )

    confirmed = await service.confirm_registration_email_verification(token=token)

    assert confirmed.email == "new@example.com"
    assert repo.users[0].email_verified_at == "verified"
    assert result.requires_email_verification is True


async def test_resend_registration_email_verification_respects_cooldown(monkeypatch) -> None:
    service, _valkey, _repo = _build_service(monkeypatch)
    sent: list[dict[str, object]] = []

    monkeypatch.setattr(
        "src.modules.auth.registration.service.get_public_register_policy",
        _get_verification_policy,
    )
    monkeypatch.setattr(service.email_service, "is_enabled", _email_enabled)

    async def _fake_send(**kwargs: object) -> None:
        sent.append(kwargs)

    monkeypatch.setattr(service, "send_registration_verification_email", _fake_send)

    await service.register_public(password="pass1234", email="new@example.com")
    resent = await service.resend_registration_email_verification(email="new@example.com")

    assert resent.requires_email_verification is True
    assert resent.retry_after is not None
    assert resent.retry_after > 0
    assert len(sent) == 1
