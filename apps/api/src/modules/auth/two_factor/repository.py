from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.auth.user_two_factor import UserTwoFactor, UserTwoFactorBackupCode


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
    async def get_record(self, user_id: UUID, *, conn: BaseDBAsyncClient | None = None) -> UserTwoFactorLike | None: ...

    async def upsert_pending_secret(
        self, *, user_id: UUID, totp_secret_enc: str, conn: BaseDBAsyncClient | None = None
    ) -> UserTwoFactorLike: ...

    async def set_enabled_at(
        self, *, user_id: UUID, enabled_at: datetime, conn: BaseDBAsyncClient | None = None
    ) -> None: ...

    async def delete_record(self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None) -> None: ...

    async def delete_backup_codes(self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None) -> int: ...

    async def create_backup_codes(
        self, *, user_id: UUID, items: list[dict[str, str]], conn: BaseDBAsyncClient | None = None
    ) -> None: ...

    async def list_unused_backup_codes(
        self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> Sequence[UserTwoFactorBackupCodeLike]: ...

    async def mark_backup_code_used(
        self, *, code_id: UUID, used_at: datetime, conn: BaseDBAsyncClient | None = None
    ) -> None: ...

    async def count_unused_backup_codes(self, *, user_id: UUID) -> int: ...

    async def try_advance_totp_counter(
        self, *, user_id: UUID, counter: int, used_at: datetime, conn: BaseDBAsyncClient | None = None
    ) -> bool: ...


class TwoFactorRepository(TortoiseORMRepository, TwoFactorRepositoryLike):
    async def get_record(self, user_id: UUID, *, conn: BaseDBAsyncClient | None = None) -> UserTwoFactor | None:
        return await self.using_db(UserTwoFactor.filter(user_id=user_id), conn).first()

    async def upsert_pending_secret(
        self, *, user_id: UUID, totp_secret_enc: str, conn: BaseDBAsyncClient | None = None
    ) -> UserTwoFactor:
        record = await self.get_record(user_id, conn=conn)
        if record is None:
            return await UserTwoFactor.create(
                **self._using_db_kwargs(conn),
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
        await record.save(
            update_fields=("totp_secret_enc", "enabled_at", "last_totp_counter", "last_totp_used_at"),
            **self._using_db_kwargs(conn),
        )
        return record

    async def set_enabled_at(
        self, *, user_id: UUID, enabled_at: datetime, conn: BaseDBAsyncClient | None = None
    ) -> None:
        record = await self.get_record(user_id, conn=conn)
        if record is None:
            raise RuntimeError("user_two_factor record missing")
        record.enabled_at = enabled_at
        await record.save(update_fields=("enabled_at",), **self._using_db_kwargs(conn))

    async def delete_record(self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None) -> None:
        await self.using_db(UserTwoFactor.filter(user_id=user_id), conn).delete()

    async def delete_backup_codes(self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None) -> int:
        return await self.using_db(UserTwoFactorBackupCode.filter(user_id=user_id), conn).delete()

    async def create_backup_codes(
        self, *, user_id: UUID, items: list[dict[str, str]], conn: BaseDBAsyncClient | None = None
    ) -> None:
        await UserTwoFactorBackupCode.bulk_create(
            [
                UserTwoFactorBackupCode(
                    user_id=user_id,
                    salt=item["salt"],
                    code_hash=item["code_hash"],
                    used_at=None,
                )
                for item in items
            ],
            **self._using_db_kwargs(conn),
        )

    async def list_unused_backup_codes(
        self, *, user_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[UserTwoFactorBackupCode]:
        return await self.using_db(UserTwoFactorBackupCode.filter(user_id=user_id, used_at=None), conn).all()

    async def mark_backup_code_used(
        self, *, code_id: UUID, used_at: datetime, conn: BaseDBAsyncClient | None = None
    ) -> None:
        record = await self.using_db(UserTwoFactorBackupCode.filter(id=code_id), conn).first()
        if record is None:
            raise RuntimeError("backup code missing")
        record.used_at = used_at
        await record.save(update_fields=("used_at",), **self._using_db_kwargs(conn))

    async def count_unused_backup_codes(self, *, user_id: UUID) -> int:
        return await UserTwoFactorBackupCode.filter(user_id=user_id, used_at=None).count()

    async def try_advance_totp_counter(
        self, *, user_id: UUID, counter: int, used_at: datetime, conn: BaseDBAsyncClient | None = None
    ) -> bool:
        updated = (
            await self
            .using_db(UserTwoFactor.filter(user_id=user_id), conn)
            .filter(Q(last_totp_counter__isnull=True) | Q(last_totp_counter__lt=int(counter)))
            .update(
                last_totp_counter=int(counter),
                last_totp_used_at=used_at,
            )
        )
        return updated > 0
