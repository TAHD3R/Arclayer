from __future__ import annotations

from typing import cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.events import EventBus
from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams, paginate_items
from src.core.i18n import t
from src.core.services import BaseService
from src.modules.system.settings.events.service import SettingsEventsMixin
from src.modules.system.settings.repository import SettingsRepository
from src.modules.system.settings.schema import SettingsDetail, SettingsNamespaceSummary
from src.modules.system.settings.schemahelpers.service import SettingsSchemaHelpersMixin
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from src.settings.runtime import invalidate_core_settings_cache
from src.settings.validation import iter_secret_field_paths, merge_deep, validate_config_schema


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


class SettingsService(
    SettingsEventsMixin,
    SettingsSchemaHelpersMixin,
    BaseService,
):
    def __init__(self, settings: Settings, *, event_bus: EventBus) -> None:
        super().__init__(settings, event_publisher=event_bus)
        self.repo = SettingsRepository()
        self.event_bus = event_bus

    async def list_namespaces(self, *, params: PageParams) -> PageData[SettingsNamespaceSummary]:
        items: list[SettingsNamespaceSummary] = [
            SettingsNamespaceSummary(
                namespace=CORE_SETTINGS_NAMESPACE,
                kind="core",
                title=_ts("CORE_SETTINGS_TITLE", "系统设置"),
                description=_ts("CORE_SETTINGS_DESC", "站点设置与基础系统配置。"),
            )
        ]
        return paginate_items(items, params=params)

    async def get_namespace_detail(self, namespace: str) -> SettingsDetail:
        if namespace == CORE_SETTINGS_NAMESPACE:
            schema = CORE_SETTINGS_SCHEMA
            record = await self.repo.get_by_namespace(CORE_SETTINGS_NAMESPACE)
            raw = record.value if record and isinstance(record.value, dict) else {}
            masked, secrets = self._mask_secrets(schema, raw)
            return SettingsDetail(
                namespace=CORE_SETTINGS_NAMESPACE,
                setting_schema=self._to_schema_item(schema),
                value=masked,
                secrets=secrets,
                updated_at=record.updated_at if record else None,
            )

        raise NotFound(message=_ts("NAMESPACE_NOT_FOUND", "配置域不存在"), error="SETTINGS_NAMESPACE_NOT_FOUND")

    async def patch_namespace(
        self,
        namespace: str,
        *,
        patch: JsonObject,
        updated_by: UUID | None,
    ) -> SettingsDetail:
        if namespace == CORE_SETTINGS_NAMESPACE:
            schema = CORE_SETTINGS_SCHEMA
            record = await self.repo.get_by_namespace(CORE_SETTINGS_NAMESPACE)
            current = record.value if record and isinstance(record.value, dict) else {}
            merged = merge_deep(current, patch)

            validate_config_schema(schema, merged, allow_unknown=True)

            async with self.tx() as conn:
                saved = await self.repo.upsert(
                    namespace=CORE_SETTINGS_NAMESPACE,
                    value=merged,
                    updated_by=updated_by,
                    conn=conn,
                )
                await self._emit_settings_updated(
                    namespace=CORE_SETTINGS_NAMESPACE,
                    schema=schema,
                    patch=patch,
                    actor_user_id=str(updated_by) if updated_by is not None else None,
                    conn=conn,
                )
            invalidate_core_settings_cache()
            masked, secrets = self._mask_secrets(schema, merged)
            return SettingsDetail(
                namespace=CORE_SETTINGS_NAMESPACE,
                setting_schema=self._to_schema_item(schema),
                value=masked,
                secrets=secrets,
                updated_at=saved.updated_at,
            )

        raise NotFound(message=_ts("NAMESPACE_NOT_FOUND", "配置域不存在"), error="SETTINGS_NAMESPACE_NOT_FOUND")

    @staticmethod
    def _mask_secrets(schema, config: JsonObject) -> tuple[JsonObject, dict[str, bool]]:
        masked: JsonObject = dict(config or {})
        secrets: dict[str, bool] = {}

        for path in iter_secret_field_paths(schema):
            section_id, field_key = path.split(".", 1)
            section = masked.get(section_id)
            if not isinstance(section, dict):
                secrets[path] = False
                continue
            section_dict = cast(JsonObject, section)
            value = section_dict.get(field_key)
            if value is None:
                secrets[path] = False
                continue
            secrets[path] = True
            section_dict[field_key] = None

        return masked, secrets
