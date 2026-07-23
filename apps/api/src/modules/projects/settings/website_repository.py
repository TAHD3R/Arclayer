from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.protocols.tortoise import SettingUpdatedBy
from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.system.setting import SettingRecord
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_PROJECT


class ProjectWebsiteSettingsRepository(TortoiseORMRepository):
    async def get_core(self, *, project_id: UUID) -> SettingRecord | None:
        return await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_PROJECT,
            scope_id=project_id,
            namespace=CORE_SETTINGS_NAMESPACE,
        )

    async def get_core_for_update(
        self,
        *,
        project_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SettingRecord:
        candidate = SettingRecord(
            scope_type=SCOPE_TYPE_PROJECT,
            scope_id=project_id,
            namespace=CORE_SETTINGS_NAMESPACE,
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
                scope_type=SCOPE_TYPE_PROJECT,
                scope_id=project_id,
                namespace=CORE_SETTINGS_NAMESPACE,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if record is None:
            raise RuntimeError("Project settings identity insert did not produce a canonical row")
        return record

    async def save_core(
        self,
        *,
        record: SettingRecord,
        value: JsonObject,
        updated_by: UUID,
        conn: BaseDBAsyncClient,
    ) -> SettingRecord:
        record.value = value
        cast(SettingUpdatedBy, record).updated_by = updated_by
        await record.save(
            update_fields=["value", "updated_by", "updated_at"],
            using_db=conn,
        )
        return record
