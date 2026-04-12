from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from src.common.protocols.tortoise import SettingUpdatedBy
from src.common.repositories.base import BaseRepository
from src.models.system.setting import SettingRecord
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


class SettingsRepository(BaseRepository):
    async def get_by_namespace(self, namespace: str) -> SettingRecord | None:
        # Admin settings are system-scoped in v2.
        return await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace=namespace
        )

    async def upsert(
        self,
        *,
        namespace: str,
        value: dict[str, Any] | None,
        updated_by: UUID | None = None,
    ) -> SettingRecord:
        record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM, scope_id=SYSTEM_SCOPE_ID, namespace=namespace
        )
        if record is None:
            record = await SettingRecord.create(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=namespace,
                value=value,
                updated_by=updated_by,
            )
            return record
        record.value = value
        cast(SettingUpdatedBy, record).updated_by = updated_by
        await record.save()
        return record
