from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from src.common.security.totp import TotpVerifyResult
from src.config import get_settings
from src.core.exceptions import BadRequest
from src.modules.auth.two_factor.service import AuthTwoFactorService


@dataclass
class _FakeTwoFactorRecord:
    id: UUID
    user_id: UUID
    totp_secret_enc: str
    enabled_at: datetime | None


class _FakeTwoFactorRepo:
    def __init__(self, *, record: _FakeTwoFactorRecord) -> None:
        self._record = record
        self._last_counter: int | None = None

    async def get_record(self, user_id: UUID) -> _FakeTwoFactorRecord | None:
        return self._record if user_id == self._record.user_id else None

    async def upsert_pending_secret(self, *, user_id: UUID, totp_secret_enc: str):
        raise RuntimeError("not used")

    async def set_enabled_at(self, *, user_id: UUID, enabled_at: datetime) -> None:
        raise RuntimeError("not used")

    async def delete_record(self, *, user_id: UUID) -> None:
        raise RuntimeError("not used")

    async def delete_backup_codes(self, *, user_id: UUID) -> int:
        raise RuntimeError("not used")

    async def create_backup_codes(self, *, user_id: UUID, items: list[dict[str, str]]) -> None:
        raise RuntimeError("not used")

    async def list_unused_backup_codes(self, *, user_id: UUID):
        raise RuntimeError("not used")

    async def mark_backup_code_used(self, *, code_id: UUID, used_at: datetime) -> None:
        raise RuntimeError("not used")

    async def count_unused_backup_codes(self, *, user_id: UUID) -> int:
        raise RuntimeError("not used")

    async def try_advance_totp_counter(self, *, user_id: UUID, counter: int, used_at: datetime) -> bool:
        if user_id != self._record.user_id:
            return False
        if self._last_counter is None or counter > self._last_counter:
            self._last_counter = counter
            return True
        return False


def _build_service(monkeypatch, *, user_id: UUID, used_counter_for_code) -> AuthTwoFactorService:
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    settings = get_settings()

    monkeypatch.setattr(
        "src.modules.auth.two_factor.service.master_key_exists",
        lambda _path: True,
    )
    monkeypatch.setattr(
        "src.modules.auth.two_factor.service.load_master_key",
        lambda _path: b"x" * 32,
    )
    monkeypatch.setattr(
        "src.modules.auth.two_factor.service.decrypt_secret",
        lambda _value, *, key, aad: "secret",
    )

    def _verify(_secret: str, *, code: str, **_kw) -> TotpVerifyResult:
        return TotpVerifyResult(ok=True, used_counter=int(used_counter_for_code(code)))

    monkeypatch.setattr(
        "src.modules.auth.two_factor.service.verify_totp_code",
        _verify,
    )

    record = _FakeTwoFactorRecord(
        id=uuid4(),
        user_id=user_id,
        totp_secret_enc="enc",
        enabled_at=datetime.now(tz=UTC),
    )

    class _NoopUserRepo(SimpleNamespace):
        async def get_by_id_with_credential(self, user_id: UUID):
            return None

    return AuthTwoFactorService(settings, repo=_FakeTwoFactorRepo(record=record), user_repo=_NoopUserRepo())


async def test_totp_rejects_replay_same_counter(monkeypatch) -> None:
    user_id = uuid4()
    service = _build_service(monkeypatch, user_id=user_id, used_counter_for_code=lambda _code: 100)

    await service.verify_for_login(user_id=user_id, code="123456", backup_code=None)
    with pytest.raises(BadRequest) as exc:
        await service.verify_for_login(user_id=user_id, code="123456", backup_code=None)

    assert exc.value.error == "TWO_FACTOR_CODE_REPLAY"


async def test_totp_allows_newer_counter(monkeypatch) -> None:
    user_id = uuid4()

    def _counter(code: str) -> int:
        return 100 if code == "A" else 101

    service = _build_service(monkeypatch, user_id=user_id, used_counter_for_code=_counter)

    await service.verify_for_login(user_id=user_id, code="A", backup_code=None)
    await service.verify_for_login(user_id=user_id, code="B", backup_code=None)
