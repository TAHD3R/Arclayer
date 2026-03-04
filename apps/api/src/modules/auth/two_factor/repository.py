from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Protocol
from uuid import UUID

from tortoise.expressions import Q

from apps.api.src.models.auth.user_two_factor import UserTwoFactor, UserTwoFactorBackupCode


class UserTwoFactorLike(Protocol):
    @property
    def totp_secret_enc(self) -> object: ...

    @property
    def enabled_at(self) -> object: ...


class UserTwoFactorBackupCodeLike(Protocol):
    @property
    def id(self) -> object: ...

    @property
    def salt(self) -> object: ...

    @property
    def code_hash(self) -> object: ...


class TwoFactorRepositoryLike(Protocol):
    async def get_record(self, user_id: UUID) -> UserTwoFactorLike | None: ...

    async def upsert_pending_secret(self, *, user_id: UUID, totp_secret_enc: str) -> UserTwoFactorLike: ...

    async def set_enabled_at(self, *, user_id: UUID, enabled_at: datetime) -> None: ...

    async def delete_record(self, *, user_id: UUID) -> None: ...

    async def delete_backup_codes(self, *, user_id: UUID) -> int: ...

    async def create_backup_codes(self, *, user_id: UUID, items: list[dict[str, str]]) -> None: ...

    async def list_unused_backup_codes(self, *, user_id: UUID) -> Sequence[UserTwoFactorBackupCodeLike]: ...

    async def mark_backup_code_used(self, *, code_id: UUID, used_at: datetime) -> None: ...

    async def count_unused_backup_codes(self, *, user_id: UUID) -> int: ...

    async def try_advance_totp_counter(self, *, user_id: UUID, counter: int, used_at: datetime) -> bool: ...


class TwoFactorRepository(TwoFactorRepositoryLike):
    async def get_record(self, user_id: UUID) -> UserTwoFactor | None:
        return await UserTwoFactor.get_or_none(user_id=user_id)

    async def upsert_pending_secret(self, *, user_id: UUID, totp_secret_enc: str) -> UserTwoFactor:
        record = await UserTwoFactor.get_or_none(user_id=user_id)
        if record is None:
            return await UserTwoFactor.create(
                user_id=user_id,
                totp_secret_enc=totp_secret_enc,
                enabled_at=None,
                last_totp_counter=None,
                last_totp_used_at=None,
            )
        record.totp_secret_enc = totp_secret_enc
        record.enabled_at = None
        record.last_totp_counter = None
        record.last_totp_used_at = None
        await record.save(update_fields=("totp_secret_enc", "enabled_at", "last_totp_counter", "last_totp_used_at"))
        return record

    async def set_enabled_at(self, *, user_id: UUID, enabled_at: datetime) -> None:
        record = await UserTwoFactor.get_or_none(user_id=user_id)
        if record is None:
            raise RuntimeError("user_two_factor record missing")
        record.enabled_at = enabled_at
        await record.save(update_fields=("enabled_at",))

    async def delete_record(self, *, user_id: UUID) -> None:
        await UserTwoFactor.filter(user_id=user_id).delete()

    async def delete_backup_codes(self, *, user_id: UUID) -> int:
        return await UserTwoFactorBackupCode.filter(user_id=user_id).delete()

    async def create_backup_codes(self, *, user_id: UUID, items: list[dict[str, str]]) -> None:
        await UserTwoFactorBackupCode.bulk_create([
            UserTwoFactorBackupCode(user_id=user_id, salt=item["salt"], code_hash=item["code_hash"], used_at=None)
            for item in items
        ])

    async def list_unused_backup_codes(self, *, user_id: UUID) -> list[UserTwoFactorBackupCode]:
        return await UserTwoFactorBackupCode.filter(user_id=user_id, used_at=None).all()

    async def mark_backup_code_used(self, *, code_id: UUID, used_at: datetime) -> None:
        record = await UserTwoFactorBackupCode.get_or_none(id=code_id)
        if record is None:
            raise RuntimeError("backup code missing")
        record.used_at = used_at
        await record.save(update_fields=("used_at",))

    async def count_unused_backup_codes(self, *, user_id: UUID) -> int:
        return await UserTwoFactorBackupCode.filter(user_id=user_id, used_at=None).count()

    async def try_advance_totp_counter(self, *, user_id: UUID, counter: int, used_at: datetime) -> bool:
        updated = (
            await UserTwoFactor
            .filter(user_id=user_id)
            .filter(Q(last_totp_counter__isnull=True) | Q(last_totp_counter__lt=int(counter)))
            .update(
                last_totp_counter=int(counter),
                last_totp_used_at=used_at,
            )
        )
        return updated > 0
