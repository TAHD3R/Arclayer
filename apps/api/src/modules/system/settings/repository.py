from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.protocols.tortoise import SettingUpdatedBy
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.system.setting import SettingRecord
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


class SettingsRepository(TortoiseORMRepository):
    @staticmethod
    def _using_db(qs, conn: BaseDBAsyncClient | None):
        return qs if conn is None else qs.using_db(conn)

    async def get_by_namespace(self, namespace: str) -> SettingRecord | None:
        # Admin settings are system-scoped in v2.
        return await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace=namespace
        )

    async def get_by_namespace_for_update(
        self,
        namespace: str,
        *,
        conn: BaseDBAsyncClient,
    ) -> SettingRecord:
        candidate = SettingRecord(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=namespace,
            value=None,
            updated_by=None,
        )
        await SettingRecord.bulk_create(
            [candidate],
            ignore_conflicts=True,
            using_db=conn,
        )
        record = await (
            SettingRecord
            .filter(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=namespace,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if record is None:
            raise RuntimeError("Setting identity insert did not produce a canonical row")
        return record

    async def upsert(
        self,
        *,
        namespace: str,
        value: dict[str, Any] | None,
        updated_by: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> SettingRecord:
        record = await self._using_db(
            SettingRecord.filter(scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace=namespace),
            conn,
        ).first()
        if record is None:
            row: dict[str, Any] = {
                "scope_type": SCOPE_TYPE_SYSTEM,
                "scope_id": SYSTEM_SCOPE_ID,
                "namespace": namespace,
                "value": value,
                "updated_by": updated_by,
            }
            if conn is None:
                record = await SettingRecord.create(**row)
            else:
                record = await SettingRecord.create(using_db=conn, **row)
            return record
        record.value = value
        cast(SettingUpdatedBy, record).updated_by = updated_by
        await record.save(using_db=conn)
        return record
