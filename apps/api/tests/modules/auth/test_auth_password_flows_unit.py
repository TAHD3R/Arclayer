from __future__ import annotations

import builtins
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi_mail.errors import ConnectionErrors
from pydantic import BaseModel, ConfigDict

from src.config import get_settings
from src.core.exceptions import Conflict, ServiceUnavailable, Unauthorized
from src.core.i18n import t
from src.models.organization.user import UserStatus
from src.modules.auth.contracts.schema import UserLike
from src.modules.auth.service import AuthService
from src.modules.auth.tokens.service import hash_password, verify_password


class _FakeRaw:
    async def sadd(self, key: str, *values: str) -> int:
        return 0

    async def smembers(self, key: str) -> builtins.set[str]:
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

    async def remove_password(self, user: UserLike) -> None:
        record = cast(FakeUser, user)
        record.credential = None

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
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
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


async def test_change_password_rejects_same_password_as_business_error(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    with pytest.raises(Conflict) as exc:
        await service.change_password(user_id=user.id, old_password="oldpass1", new_password="oldpass1")

    assert exc.value.error == "PASSWORD_DUPLICATE"


async def test_email_check_reports_password_login_availability(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    exists, password_login_available = await service.get_email_check(email=cast(str, user.email))
    assert exists is True
    assert password_login_available is True

    user.credential = None

    exists, password_login_available = await service.get_email_check(email=cast(str, user.email))
    assert exists is True
    assert password_login_available is False


async def test_forgot_reset_password(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    issued = await service.forgot_password(email=cast(str, user.email))
    assert issued is not None
    token, _, _recipient, _user_id = issued

    await service.reset_password(reset_token=token, new_password="resetpass1")
    assert user.token_version == 1
    assert user.credential is not None
    assert verify_password("resetpass1", user.credential.password_hash, service.settings.auth) is True


async def test_request_email_change_uses_resend_cooldown(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    async def _enabled() -> bool:
        return True

    monkeypatch.setattr(service.email_service, "is_enabled", _enabled)

    first_code, first_expires_in, first_email, first_retry_after = await service.request_email_change(
        user=cast(Any, user),
        new_email="new@example.com",
    )
    second_code, second_expires_in, second_email, second_retry_after = await service.request_email_change(
        user=cast(Any, user),
        new_email="new@example.com",
    )

    assert first_code is not None
    assert first_expires_in > 0
    assert first_email == "new@example.com"
    assert first_retry_after == 60
    assert second_code is None
    assert second_expires_in > 0
    assert second_email == "new@example.com"
    assert second_retry_after == 60


async def test_request_remove_password_issues_login_code(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    async def _enabled() -> bool:
        return True

    async def _send_login_code(*, recipient: str, code: str, expires_in: int, user_id: str, locale: str | None) -> None:
        assert recipient == "demo@example.com"
        assert len(code) == 6
        assert expires_in > 0
        assert user_id
        _ = locale

    monkeypatch.setattr(service.email_service, "is_enabled", _enabled)
    monkeypatch.setattr(service.email_service, "send_login_code", _send_login_code)

    expires_in, retry_after = await service.request_remove_password(
        user_id=user.id,
        current_password="oldpass1",
        locale="en-US",
    )

    assert expires_in > 0
    assert retry_after == 60


async def test_request_remove_password_maps_mail_delivery_failures_to_api_error(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    class _FailingMail:
        async def send_message(self, *args, **kwargs) -> None:
            _ = args, kwargs
            raise ConnectionErrors(
                "Exception raised Error connecting to localhost on port 1025: [Errno 111] Connection refused"
            )

    async def _enabled() -> bool:
        return True

    async def _get_fast_mail() -> _FailingMail:
        return _FailingMail()

    monkeypatch.setattr(service.email_service, "_enabled", _enabled)
    monkeypatch.setattr(service.email_service, "_get_fast_mail", _get_fast_mail)

    with pytest.raises(ServiceUnavailable) as exc:
        await service.request_remove_password(
            user_id=user.id,
            current_password="oldpass1",
            locale="en-US",
        )

    assert exc.value.error == "MAIL_DELIVERY_FAILED"
    assert exc.value.message == t("auth", "MAIL_DELIVERY_FAILED")
    assert "Connection refused" not in exc.value.message


async def test_confirm_remove_password_deletes_local_credential(monkeypatch) -> None:
    service, user = _build_service(monkeypatch)

    async def _enabled() -> bool:
        return True

    async def _send_login_code(*, recipient: str, code: str, expires_in: int, user_id: str, locale: str | None) -> None:
        _ = recipient, code, expires_in, user_id, locale

    monkeypatch.setattr(service.email_service, "is_enabled", _enabled)
    monkeypatch.setattr(service.email_service, "send_login_code", _send_login_code)

    await service.request_remove_password(user_id=user.id, current_password="oldpass1", locale="en-US")
    store = service.password_removal_store
    assert store is not None
    record = await store.get(user_id=user.id)
    assert record is not None

    await service.confirm_remove_password(user_id=user.id, code=str(record["code"]))

    assert user.credential is None
    assert user.token_version == 1
