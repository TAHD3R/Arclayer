from __future__ import annotations

from typing import Any

from apps.api.common.repositories.base import BaseRepository
from apps.api.models.setting import SettingRecord


class SettingsRepository(BaseRepository):
    async def get_by_namespace(self, namespace: str) -> SettingRecord | None:
        return await SettingRecord.get_or_none(namespace=namespace)

    async def upsert(
        self,
        *,
        namespace: str,
        value: dict[str, Any] | None,
        updated_by: Any | None = None,
    ) -> SettingRecord:
        record = await SettingRecord.get_or_none(namespace=namespace)
        if record is None:
            record = await SettingRecord.create(namespace=namespace, value=value, updated_by=updated_by)
            return record
        record.value = value
        record.updated_by = updated_by
        await record.save()
        return record
