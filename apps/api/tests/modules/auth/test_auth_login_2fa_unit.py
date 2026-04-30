from __future__ import annotations

import builtins
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi_mail.errors import ConnectionErrors
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import BadRequest, ServiceUnavailable, Unauthorized
from src.core.i18n import t
from src.models.organization.user import UserStatus
from src.modules.auth.contracts.schema import UserRepositoryLike
from src.modules.auth.login.service import AuthLoginService
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

    async def remove_password(self, user) -> None:
        user.credential = None

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
        self,
        *,
        username: str,
        email: str | None,
        display_name: str | None,
        password_hash: str,
        is_super_admin: bool = False,
    ) -> FakeUser:
        _ = username, email, display_name, password_hash, is_super_admin
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
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()

    user = FakeUser(id=uuid4(), username="demo", email="demo@example.com")
    user.credential = FakeCredential(password_hash=hash_password("pass", settings.auth))

    valkey = FakeValkeyClient()
    repo = FakeUserRepository(user)
    auth = AuthService(settings, valkey=valkey, user_repo=cast(UserRepositoryLike, repo))

    two_factor = FakeTwoFactor(enabled=two_factor_enabled)
    login = AuthLoginService(settings, valkey=valkey, auth_service=auth, two_factor=two_factor)
    return login, valkey, user


async def test_login_returns_two_factor_challenge(monkeypatch) -> None:
    service, _, _ = _build_login_service(monkeypatch, two_factor_enabled=True)

    with pytest.raises(Unauthorized) as exc:
        await service.login(email="demo@example.com", password="pass")

    assert exc.value.error == "TWO_FACTOR_REQUIRED"
    assert isinstance(exc.value.meta, dict)
    assert isinstance(exc.value.meta.get("two_factor_token"), str)
    assert isinstance(exc.value.meta.get("expires_in"), int)


async def test_complete_two_factor_login_issues_tokens(monkeypatch) -> None:
    service, valkey, user = _build_login_service(monkeypatch, two_factor_enabled=True)

    with pytest.raises(Unauthorized) as exc:
        await service.login(email="demo@example.com", password="pass")

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
        await service.login(email="demo@example.com", password="pass")

    assert exc.value.meta is not None
    token = str(exc.value.meta["two_factor_token"])
    with pytest.raises(Unauthorized) as invalid:
        await service.complete_two_factor_login(two_factor_token=token, code="000000", backup_code=None)

    assert invalid.value.error == "TWO_FACTOR_CODE_INVALID"
    record = valkey._store.get(f"auth:2fa:challenge:{token}")
    assert isinstance(record, dict)
    assert int(record.get("attempts") or 0) == 1


async def test_complete_two_factor_login_preserves_challenge_on_service_error(monkeypatch) -> None:
    service, valkey, _ = _build_login_service(monkeypatch, two_factor_enabled=True)

    class FailingTwoFactor:
        async def is_enabled(self, *, user_id: UUID) -> bool:
            return True

        async def verify_for_login(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None:
            raise ServiceUnavailable(message="系统未配置 Master Key，无法使用 2FA", error="MASTER_KEY_MISSING")

    service.two_factor = FailingTwoFactor()

    with pytest.raises(Unauthorized) as exc:
        await service.login(email="demo@example.com", password="pass")

    assert exc.value.meta is not None
    token = str(exc.value.meta["two_factor_token"])

    with pytest.raises(ServiceUnavailable) as service_error:
        await service.complete_two_factor_login(two_factor_token=token, code="123456", backup_code=None)

    assert service_error.value.error == "MASTER_KEY_MISSING"
    record = valkey._store.get(f"auth:2fa:challenge:{token}")
    assert isinstance(record, dict)
    assert int(record.get("attempts") or 0) == 0


async def test_request_login_email_code_stores_code_and_returns_metadata(monkeypatch) -> None:
    service, valkey, user = _build_login_service(monkeypatch, two_factor_enabled=False)
    sent: list[dict[str, object]] = []

    async def _fake_enabled() -> bool:
        return True

    async def _fake_send_login_code(*, recipient: str, code: str, expires_in: int, **kwargs) -> None:
        sent.append({"recipient": recipient, "code": code, "expires_in": expires_in})

    monkeypatch.setattr(service.auth_service.email_service, "is_enabled", _fake_enabled)
    monkeypatch.setattr(service.auth_service.email_service, "send_login_code", _fake_send_login_code)

    metadata = await service.request_login_email_code(email="demo@example.com")

    assert metadata.expires_in >= 60
    assert metadata.retry_after == 60
    record = valkey._store.get("auth:login_code:email:demo@example.com")
    assert isinstance(record, dict)
    assert record.get("user_id") == str(user.id)
    assert sent == [
        {
            "recipient": "demo@example.com",
            "code": str(record.get("code")),
            "expires_in": metadata.expires_in,
        }
    ]


async def test_request_login_email_code_reissues_after_resend_cooldown(monkeypatch) -> None:
    service, valkey, _ = _build_login_service(monkeypatch, two_factor_enabled=False)
    sent: list[dict[str, object]] = []

    async def _fake_is_enabled() -> bool:
        return True

    async def _fake_send_login_code(*, recipient: str, code: str, expires_in: int, **kwargs) -> None:
        sent.append({"recipient": recipient, "code": code, "expires_in": expires_in})

    monkeypatch.setattr(service.auth_service.email_service, "is_enabled", _fake_is_enabled)
    monkeypatch.setattr(service.auth_service.email_service, "send_login_code", _fake_send_login_code)

    first = await service.request_login_email_code(email="demo@example.com")
    first_record = valkey._store.get("auth:login_code:email:demo@example.com")
    assert isinstance(first_record, dict)
    first_code = str(first_record.get("code") or "")
    assert first.retry_after == 60
    assert first_code

    first_record["resend_available_at"] = 0

    second = await service.request_login_email_code(email="demo@example.com")
    second_record = valkey._store.get("auth:login_code:email:demo@example.com")
    assert isinstance(second_record, dict)
    second_code = str(second_record.get("code") or "")

    assert second.retry_after == 60
    assert second_code
    assert second_code != first_code
    assert sent == [
        {
            "recipient": "demo@example.com",
            "code": first_code,
            "expires_in": first.expires_in,
        },
        {
            "recipient": "demo@example.com",
            "code": second_code,
            "expires_in": second.expires_in,
        },
    ]


async def test_request_login_email_code_maps_mail_delivery_failures_to_api_error(monkeypatch) -> None:
    service, valkey, _ = _build_login_service(monkeypatch, two_factor_enabled=False)

    class _FailingMail:
        async def send_message(self, *args, **kwargs) -> None:
            _ = args, kwargs
            raise ConnectionErrors(
                "Exception raised Error connecting to localhost on port 1025: [Errno 111] Connection refused"
            )

    async def _fake_is_enabled() -> bool:
        return True

    async def _fake_get_fast_mail() -> _FailingMail:
        return _FailingMail()

    monkeypatch.setattr(service.auth_service.email_service, "_enabled", _fake_is_enabled)
    monkeypatch.setattr(service.auth_service.email_service, "_get_fast_mail", _fake_get_fast_mail)

    with pytest.raises(ServiceUnavailable) as exc:
        await service.request_login_email_code(email="demo@example.com")

    assert exc.value.error == "MAIL_DELIVERY_FAILED"
    assert exc.value.message == t("auth", "MAIL_DELIVERY_FAILED")
    assert "Connection refused" not in exc.value.message
    assert "auth:login_code:email:demo@example.com" not in valkey._store


async def test_verify_login_email_code_issues_tokens(monkeypatch) -> None:
    service, valkey, user = _build_login_service(monkeypatch, two_factor_enabled=False)

    async def _fake_is_enabled() -> bool:
        return True

    async def _fake_send_login_code(*, recipient: str, code: str, expires_in: int, **kwargs) -> None:
        return None

    monkeypatch.setattr(service.auth_service.email_service, "is_enabled", _fake_is_enabled)
    monkeypatch.setattr(service.auth_service.email_service, "send_login_code", _fake_send_login_code)

    await service.request_login_email_code(email="demo@example.com")
    record = valkey._store.get("auth:login_code:email:demo@example.com")
    assert isinstance(record, dict)

    tokens = await service.verify_login_email_code(email="demo@example.com", code=str(record.get("code")))
    assert tokens.access_token
    assert tokens.refresh_token
    assert "auth:login_code:email:demo@example.com" not in valkey._store

    refresh_payload = decode_token(tokens.refresh_token, service.settings.auth)
    jti = refresh_payload.get("jti")
    assert isinstance(jti, str)
    refresh_record = valkey._store.get(f"auth:refresh:{jti}")
    assert isinstance(refresh_record, dict)
    assert refresh_record.get("auth_method") == "email_code"
    assert UUID(str(refresh_payload.get("sub"))) == user.id


async def test_verify_login_email_code_starts_two_factor_challenge(monkeypatch) -> None:
    service, valkey, _ = _build_login_service(monkeypatch, two_factor_enabled=True)

    async def _fake_is_enabled() -> bool:
        return True

    async def _fake_send_login_code(*, recipient: str, code: str, expires_in: int, **kwargs) -> None:
        return None

    monkeypatch.setattr(service.auth_service.email_service, "is_enabled", _fake_is_enabled)
    monkeypatch.setattr(service.auth_service.email_service, "send_login_code", _fake_send_login_code)

    await service.request_login_email_code(email="demo@example.com")
    record = valkey._store.get("auth:login_code:email:demo@example.com")
    assert isinstance(record, dict)

    with pytest.raises(Unauthorized) as exc:
        await service.verify_login_email_code(email="demo@example.com", code=str(record.get("code")))

    assert exc.value.error == "TWO_FACTOR_REQUIRED"
    challenge_token = str((exc.value.meta or {}).get("two_factor_token") or "")
    assert challenge_token
    challenge_record = valkey._store.get(f"auth:2fa:challenge:{challenge_token}")
    assert isinstance(challenge_record, dict)
    assert challenge_record.get("auth_method") == "email_code"
