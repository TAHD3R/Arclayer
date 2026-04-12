from __future__ import annotations

import hmac
import os
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Final, Protocol, cast
from urllib.parse import quote, urlencode
from uuid import UUID

from apps.api.src.common.constants.auth import REAUTH_MAX_AGE_SECONDS
from apps.api.src.common.security.totp import generate_totp_secret, verify_totp_code
from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable, Unauthorized
from apps.api.src.core.i18n import t
from apps.api.src.modules.auth.tokens.service import verify_password
from apps.api.src.modules.auth.two_factor.repository import TwoFactorRepository, TwoFactorRepositoryLike
from apps.api.src.settings.crypto import decrypt_secret, encrypt_secret, load_master_key, master_key_exists

_BACKUP_CODE_COUNT: Final[int] = 10
_BACKUP_CODE_BYTES: Final[int] = 10
_BACKUP_CODE_ALPHABET: Final[str] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_BACKUP_CODE_NORMALIZE_RE: Final[re.Pattern[str]] = re.compile(r"[^A-Za-z0-9]+")


def _aad(user_id: UUID) -> str:
    return f"auth:2fa:user:{user_id}"


def _normalize_backup_code(code: str) -> str:
    raw = (code or "").strip().upper()
    return _BACKUP_CODE_NORMALIZE_RE.sub("", raw)


def _build_backup_code() -> str:
    # Human-friendly code with grouping.
    raw = "".join(_BACKUP_CODE_ALPHABET[b % len(_BACKUP_CODE_ALPHABET)] for b in os.urandom(_BACKUP_CODE_BYTES))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


@dataclass(frozen=True)
class BackupCodeHash:
    salt: str
    code_hash: str


def _hash_backup_code(*, code: str, salt: str, pepper: bytes) -> str:
    normalized = _normalize_backup_code(code)
    if not normalized:
        raise ValueError("backup code empty")
    msg = (salt + ":" + normalized).encode("utf-8")
    return hmac.new(pepper, msg, sha256).hexdigest()


def _make_backup_code_hashes(*, codes: list[str], pepper: bytes) -> list[BackupCodeHash]:
    out: list[BackupCodeHash] = []
    for code in codes:
        salt = os.urandom(16).hex()
        out.append(BackupCodeHash(salt=salt, code_hash=_hash_backup_code(code=code, salt=salt, pepper=pepper)))
    return out


class _CredentialLike(Protocol):
    @property
    def password_hash(self) -> object: ...


class _UserLike(Protocol):
    @property
    def id(self) -> object: ...

    @property
    def last_login_at(self) -> object: ...

    @property
    def credential(self) -> object: ...


class _UserRepositoryLike(Protocol):
    async def get_by_id_with_credential(self, user_id: UUID) -> _UserLike | None: ...


class AuthTwoFactorService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repo: TwoFactorRepositoryLike | None = None,
        user_repo: _UserRepositoryLike | None = None,
    ) -> None:
        super().__init__(settings)
        self.repo = repo or TwoFactorRepository()
        from apps.api.src.modules.auth.repository import UserRepository

        self.user_repo = user_repo or cast(_UserRepositoryLike, UserRepository())

    def _ta(self, key: str, default: str) -> str:
        return t("auth", key, default=default)

    def _require_master_key(self) -> bytes:
        path = self.settings.security.master_key_path
        if not master_key_exists(path):
            raise ServiceUnavailable(
                message=self._ta("MASTER_KEY_MISSING", "系统未配置 master key，无法启用 2FA"),
                error="MASTER_KEY_MISSING",
            )
        try:
            return load_master_key(path)
        except (OSError, ValueError) as exc:
            raise ServiceUnavailable(
                message=self._ta("MASTER_KEY_INVALID", "master key 无效，无法启用 2FA"),
                error="MASTER_KEY_INVALID",
            ) from exc

    async def get_status(self, *, user_id: UUID) -> tuple[bool, int]:
        record = await self.repo.get_record(user_id)
        enabled = bool(record and record.enabled_at is not None)
        remaining = await self.repo.count_unused_backup_codes(user_id=user_id) if enabled else 0
        return enabled, remaining

    async def is_enabled(self, *, user_id: UUID) -> bool:
        record = await self.repo.get_record(user_id)
        return bool(record and record.enabled_at is not None)

    async def _ensure_reauthed_for_setup(self, *, user_id: UUID, password: str | None) -> None:
        user = await self.user_repo.get_by_id_with_credential(user_id)
        if user is None:
            raise Unauthorized(message=self._ta("USER_NOT_FOUND", "用户不存在"), error="USER_NOT_FOUND")

        credential = cast(_CredentialLike | None, getattr(user, "credential", None))
        if credential is not None:
            normalized = (password or "").strip()
            if not normalized:
                raise Unauthorized(
                    message=self._ta("REAUTH_REQUIRED", "需要重新验证"),
                    error="REAUTH_REQUIRED",
                    meta={"methods": ["password"]},
                )
            if not verify_password(normalized, cast(str, credential.password_hash), self.settings.auth):
                raise Unauthorized(
                    message=self._ta("INVALID_CREDENTIALS", "账号或密码错误"),
                    error="INVALID_CREDENTIALS",
                )
            return

        last_login_at = cast(datetime | None, getattr(user, "last_login_at", None))
        if last_login_at is None:
            raise Unauthorized(
                message=self._ta("REAUTH_REQUIRED", "需要重新验证"),
                error="REAUTH_REQUIRED",
                meta={"methods": ["relogin"]},
            )

        now = datetime.now(tz=UTC)
        age = (now - last_login_at.astimezone(UTC)).total_seconds()
        if age > float(REAUTH_MAX_AGE_SECONDS):
            raise Unauthorized(
                message=self._ta("REAUTH_REQUIRED", "需要重新验证"),
                error="REAUTH_REQUIRED",
                meta={"methods": ["relogin"]},
            )

    async def begin_setup(
        self,
        *,
        user_id: UUID,
        issuer: str,
        account_label: str,
        password: str | None,
    ) -> tuple[str, str]:
        record = await self.repo.get_record(user_id)
        if record and record.enabled_at is not None:
            raise Conflict(
                message=self._ta("TWO_FACTOR_ALREADY_ENABLED", "已启用 2FA"),
                error="TWO_FACTOR_ALREADY_ENABLED",
            )

        await self._ensure_reauthed_for_setup(user_id=user_id, password=password)

        master_key = self._require_master_key()
        secret = generate_totp_secret()
        secret_enc = encrypt_secret(secret, key=master_key, aad=_aad(user_id))
        await self.repo.upsert_pending_secret(user_id=user_id, totp_secret_enc=secret_enc)
        await self.repo.delete_backup_codes(user_id=user_id)

        label_raw = f"{issuer}:{account_label}".strip(":")
        label = quote(label_raw, safe="")
        query = urlencode({
            "secret": secret,
            "issuer": issuer,
            "algorithm": "SHA1",
            "digits": 6,
            "period": 30,
        })
        otpauth_uri = f"otpauth://totp/{label}?{query}"
        return secret, otpauth_uri

    async def confirm_setup(self, *, user_id: UUID, code: str) -> list[str]:
        record = await self.repo.get_record(user_id)
        if record is None:
            raise NotFound(
                message=self._ta("TWO_FACTOR_NOT_SETUP", "尚未开始 2FA 绑定"),
                error="TWO_FACTOR_NOT_SETUP",
            )
        if record.enabled_at is not None:
            raise Conflict(
                message=self._ta("TWO_FACTOR_ALREADY_ENABLED", "已启用 2FA"),
                error="TWO_FACTOR_ALREADY_ENABLED",
            )

        now = datetime.now(tz=UTC)
        await self._verify_totp_or_raise(
            user_id=user_id,
            totp_secret_enc=cast(str, record.totp_secret_enc),
            code=code,
            now=now,
        )

        enabled_at = now
        await self.repo.set_enabled_at(user_id=user_id, enabled_at=enabled_at)

        master_key = self._require_master_key()
        backup_codes = [_build_backup_code() for _ in range(_BACKUP_CODE_COUNT)]
        hashes = _make_backup_code_hashes(codes=backup_codes, pepper=master_key)
        await self.repo.delete_backup_codes(user_id=user_id)
        await self.repo.create_backup_codes(
            user_id=user_id,
            items=[{"salt": h.salt, "code_hash": h.code_hash} for h in hashes],
        )
        return backup_codes

    async def _verify_or_consume_backup(
        self,
        *,
        user_id: UUID,
        backup_code: str,
        now: datetime,
    ) -> None:
        master_key = self._require_master_key()
        normalized = _normalize_backup_code(backup_code)
        if not normalized:
            raise BadRequest(
                message=self._ta("BACKUP_CODE_INVALID", "备份码无效"),
                error="BACKUP_CODE_INVALID",
            )
        candidates = await self.repo.list_unused_backup_codes(user_id=user_id)
        for item in candidates:
            expected = _hash_backup_code(code=normalized, salt=cast(str, item.salt), pepper=master_key)
            if hmac.compare_digest(expected, cast(str, item.code_hash)):
                await self.repo.mark_backup_code_used(code_id=UUID(str(item.id)), used_at=now)
                return
        raise BadRequest(
            message=self._ta("BACKUP_CODE_INVALID", "备份码无效"),
            error="BACKUP_CODE_INVALID",
        )

    async def _verify_totp_or_raise(
        self,
        *,
        user_id: UUID,
        totp_secret_enc: str,
        code: str,
        now: datetime,
    ) -> None:
        master_key = self._require_master_key()
        secret = decrypt_secret(totp_secret_enc, key=master_key, aad=_aad(user_id))
        result = verify_totp_code(secret, code=code)
        if not result.ok or result.used_counter is None:
            raise BadRequest(
                message=self._ta("TWO_FACTOR_CODE_INVALID", "验证码错误"),
                error="TWO_FACTOR_CODE_INVALID",
            )
        advanced = await self.repo.try_advance_totp_counter(user_id=user_id, counter=result.used_counter, used_at=now)
        if not advanced:
            raise BadRequest(
                message=self._ta("TWO_FACTOR_CODE_INVALID", "验证码错误"),
                error="TWO_FACTOR_CODE_REPLAY",
            )

    async def disable(self, *, user_id: UUID, code: str | None, backup_code: str | None) -> None:
        record = await self.repo.get_record(user_id)
        if record is None or record.enabled_at is None:
            raise BadRequest(
                message=self._ta("TWO_FACTOR_NOT_ENABLED", "尚未启用 2FA"),
                error="TWO_FACTOR_NOT_ENABLED",
            )

        now = datetime.now(tz=UTC)
        if code:
            await self._verify_totp_or_raise(
                user_id=user_id,
                totp_secret_enc=cast(str, record.totp_secret_enc),
                code=code,
                now=now,
            )
        elif backup_code:
            await self._verify_or_consume_backup(user_id=user_id, backup_code=backup_code, now=now)
        else:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="BAD_REQUEST")

        await self.repo.delete_backup_codes(user_id=user_id)
        await self.repo.delete_record(user_id=user_id)

    async def regenerate_backup_codes(
        self,
        *,
        user_id: UUID,
        code: str | None,
        backup_code: str | None,
    ) -> list[str]:
        record = await self.repo.get_record(user_id)
        if record is None or record.enabled_at is None:
            raise BadRequest(
                message=self._ta("TWO_FACTOR_NOT_ENABLED", "尚未启用 2FA"),
                error="TWO_FACTOR_NOT_ENABLED",
            )

        now = datetime.now(tz=UTC)
        if code:
            await self._verify_totp_or_raise(
                user_id=user_id,
                totp_secret_enc=cast(str, record.totp_secret_enc),
                code=code,
                now=now,
            )
        elif backup_code:
            await self._verify_or_consume_backup(user_id=user_id, backup_code=backup_code, now=now)
        else:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="BAD_REQUEST")

        master_key = self._require_master_key()
        backup_codes = [_build_backup_code() for _ in range(_BACKUP_CODE_COUNT)]
        hashes = _make_backup_code_hashes(codes=backup_codes, pepper=master_key)

        await self.repo.delete_backup_codes(user_id=user_id)
        await self.repo.create_backup_codes(
            user_id=user_id,
            items=[{"salt": h.salt, "code_hash": h.code_hash} for h in hashes],
        )
        return backup_codes

    async def verify_for_login(
        self,
        *,
        user_id: UUID,
        code: str | None,
        backup_code: str | None,
    ) -> None:
        record = await self.repo.get_record(user_id)
        if record is None or record.enabled_at is None:
            raise BadRequest(
                message=self._ta("TWO_FACTOR_NOT_ENABLED", "尚未启用 2FA"),
                error="TWO_FACTOR_NOT_ENABLED",
            )

        now = datetime.now(tz=UTC)
        if code:
            await self._verify_totp_or_raise(
                user_id=user_id,
                totp_secret_enc=cast(str, record.totp_secret_enc),
                code=code,
                now=now,
            )
            return

        if backup_code:
            await self._verify_or_consume_backup(user_id=user_id, backup_code=backup_code, now=now)
            return

        raise BadRequest(
            message=self._ta("TWO_FACTOR_REQUIRED", "需要进行 2FA 验证"),
            error="TWO_FACTOR_REQUIRED",
        )
