from __future__ import annotations

from uuid import UUID

from apps.api.src.common.services.base import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.events import EventBus
from apps.api.src.core.exceptions import NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.core.i18n import t
from apps.api.src.modules.system.settings.crypto.service import SettingsCryptoMixin
from apps.api.src.modules.system.settings.events.service import SettingsEventsMixin
from apps.api.src.modules.system.settings.repository import SettingsRepository
from apps.api.src.modules.system.settings.schema import SettingsDetail, SettingsNamespaceSummary
from apps.api.src.modules.system.settings.schemahelpers.service import SettingsSchemaHelpersMixin
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from apps.api.src.settings.runtime import invalidate_core_settings_cache
from apps.api.src.settings.validation import merge_deep, validate_config_schema


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


class SettingsService(
    SettingsCryptoMixin,
    SettingsEventsMixin,
    SettingsSchemaHelpersMixin,
    BaseService,
):
    def __init__(self, settings: Settings, *, event_bus: EventBus) -> None:
        super().__init__(settings)
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
        patch: dict[str, object],
        updated_by: UUID | None,
    ) -> SettingsDetail:
        if namespace == CORE_SETTINGS_NAMESPACE:
            schema = CORE_SETTINGS_SCHEMA
            record = await self.repo.get_by_namespace(CORE_SETTINGS_NAMESPACE)
            current = record.value if record and isinstance(record.value, dict) else {}
            merged = merge_deep(current, patch)

            validate_config_schema(schema, merged, allow_unknown=True)
            merged = await self._encrypt_core_secrets(schema, merged)

            saved = await self.repo.upsert(namespace=CORE_SETTINGS_NAMESPACE, value=merged, updated_by=updated_by)
            invalidate_core_settings_cache()
            await self._emit_settings_updated(
                namespace=CORE_SETTINGS_NAMESPACE,
                schema=schema,
                patch=patch,
                plugin_id=None,
                plugin_slug=None,
                actor_user_id=str(updated_by) if updated_by is not None else None,
            )
            masked, secrets = self._mask_secrets(schema, merged)
            return SettingsDetail(
                namespace=CORE_SETTINGS_NAMESPACE,
                setting_schema=self._to_schema_item(schema),
                value=masked,
                secrets=secrets,
                updated_at=saved.updated_at,
            )

        raise NotFound(message=_ts("NAMESPACE_NOT_FOUND", "配置域不存在"), error="SETTINGS_NAMESPACE_NOT_FOUND")
