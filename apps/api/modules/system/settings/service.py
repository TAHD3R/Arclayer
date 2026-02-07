from __future__ import annotations

from typing import Any

from apps.api.common.services.base import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.core.i18n import t
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.modules.system.settings.repository import SettingsRepository
from apps.api.modules.system.settings.schema import (
    SettingsDetail,
    SettingsFieldItem,
    SettingsNamespaceSummary,
    SettingsSchemaItem,
    SettingsSectionItem,
)
from apps.api.plugin.event_bus import Event
from apps.api.plugin.events import SETTINGS_UPDATED
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.manifest import ConfigSchema, build_default_config
from apps.api.settings.core_schema import CORE_SETTINGS_NAMESPACE, CORE_SETTINGS_SCHEMA
from apps.api.settings.crypto import encrypt_secret, ensure_master_key, is_encrypted, master_key_exists
from apps.api.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from apps.api.settings.validation import iter_secret_field_paths, merge_deep, validate_config_schema


def _ts(key: str, default: str) -> str:
    return t("settings", key, default=default)


class SettingsService(BaseService):
    def __init__(self, settings: Settings, *, manager: PluginManager) -> None:
        super().__init__(settings)
        self.repo = SettingsRepository()
        self.manager = manager

    async def list_namespaces(self, *, params: PageParams) -> PageData[SettingsNamespaceSummary]:
        items: list[SettingsNamespaceSummary] = [
            SettingsNamespaceSummary(
                namespace=CORE_SETTINGS_NAMESPACE,
                kind="core",
                title=_ts("CORE_SETTINGS_TITLE", "系统设置"),
                description=_ts("CORE_SETTINGS_DESC", "站点设置与基础系统配置。"),
            )
        ]

        if not self.manager.descriptors:
            self.manager.discover()

        for pid, desc in sorted(self.manager.descriptors.items(), key=lambda kv: kv[0]):
            items.append(
                SettingsNamespaceSummary(
                    namespace=f"plugin:{pid}",
                    kind="plugin",
                    title=desc.manifest.plugin.name,
                    description=desc.manifest.plugin.description,
                    plugin_id=pid,
                    plugin_slug=desc.manifest.plugin.slug,
                )
            )
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

        if namespace.startswith("plugin:"):
            plugin_id = namespace.split(":", 1)[1]
            desc = self._get_plugin_descriptor(plugin_id)
            schema = desc.manifest.config_schema
            if schema is None:
                raise BadRequest(
                    message=_ts("PLUGIN_CONFIG_NOT_SUPPORTED", "插件不支持配置"),
                    error="SETTINGS_NOT_SUPPORTED",
                )

            # Prefer the scoped settings store (encrypted secrets, masked output).
            settings_record = await self.repo.get_by_namespace(namespace)
            if settings_record and isinstance(settings_record.value, dict):
                raw = settings_record.value
                updated_at = settings_record.updated_at
            else:
                # Compatibility: older versions stored plugin config in PluginRecord.config.
                plugin_record = await PluginRecord.get_or_none(plugin_id=plugin_id)
                raw = (
                    plugin_record.config
                    if plugin_record and isinstance(plugin_record.config, dict)
                    else build_default_config(desc.manifest)
                )
                updated_at = plugin_record.updated_at if plugin_record else None

            masked, secrets = self._mask_secrets(schema, raw)
            return SettingsDetail(
                namespace=namespace,
                setting_schema=self._to_schema_item(schema),
                value=masked,
                secrets=secrets,
                updated_at=updated_at,
            )

        raise NotFound(message=_ts("NAMESPACE_NOT_FOUND", "配置域不存在"), error="SETTINGS_NAMESPACE_NOT_FOUND")

    async def patch_namespace(
        self,
        namespace: str,
        *,
        patch: dict[str, Any],
        updated_by: Any | None = None,
    ) -> SettingsDetail:
        if namespace == CORE_SETTINGS_NAMESPACE:
            schema = CORE_SETTINGS_SCHEMA
            record = await self.repo.get_by_namespace(CORE_SETTINGS_NAMESPACE)
            current = record.value if record and isinstance(record.value, dict) else {}
            merged = merge_deep(current, patch)

            validate_config_schema(schema, merged, allow_unknown=True)
            merged = await self._encrypt_core_secrets(schema, merged)

            saved = await self.repo.upsert(namespace=CORE_SETTINGS_NAMESPACE, value=merged, updated_by=updated_by)
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

        if namespace.startswith("plugin:"):
            plugin_id = namespace.split(":", 1)[1]
            desc = self._get_plugin_descriptor(plugin_id)
            schema = desc.manifest.config_schema
            if schema is None:
                raise BadRequest(
                    message=_ts("PLUGIN_CONFIG_NOT_SUPPORTED", "插件不支持配置"),
                    error="SETTINGS_NOT_SUPPORTED",
                )
            record = await self.repo.get_by_namespace(namespace)
            if record and isinstance(record.value, dict):
                current = record.value
            else:
                # Compatibility: read legacy PluginRecord.config if settings are missing.
                legacy = await PluginRecord.get_or_none(plugin_id=plugin_id)
                current = (
                    legacy.config if legacy and isinstance(legacy.config, dict) else build_default_config(desc.manifest)
                )

            merged = merge_deep(current, patch)
            validate_config_schema(schema, merged, allow_unknown=True)
            merged = await self._encrypt_plugin_secrets(
                schema,
                merged,
                namespace=namespace,
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
            )

            saved = await self.repo.upsert(namespace=namespace, value=merged, updated_by=updated_by)
            await self._emit_settings_updated(
                namespace=namespace,
                schema=schema,
                patch=patch,
                plugin_id=plugin_id,
                plugin_slug=desc.manifest.plugin.slug,
                actor_user_id=str(updated_by) if updated_by is not None else None,
            )

            masked, secrets = self._mask_secrets(schema, merged)
            return SettingsDetail(
                namespace=namespace,
                setting_schema=self._to_schema_item(schema),
                value=masked,
                secrets=secrets,
                updated_at=saved.updated_at,
            )

        raise NotFound(message=_ts("NAMESPACE_NOT_FOUND", "配置域不存在"), error="SETTINGS_NAMESPACE_NOT_FOUND")

    def _get_plugin_descriptor(self, plugin_id: str):
        if not self.manager.descriptors:
            self.manager.discover()
        desc = self.manager.descriptors.get(plugin_id)
        if desc is None:
            raise NotFound(message=_ts("PLUGIN_NOT_FOUND", "插件不存在"), error="PLUGIN_NOT_FOUND")
        return desc

    async def _emit_settings_updated(
        self,
        *,
        namespace: str,
        schema: ConfigSchema,
        patch: dict[str, Any],
        plugin_id: str | None,
        plugin_slug: str | None,
        actor_user_id: str | None,
    ) -> None:
        # Best-effort: never break settings update flows.
        try:
            secret_paths = set(iter_secret_field_paths(schema))
            changed_paths = _flatten_patch_paths(patch)
            contains_secrets = any((p in secret_paths) or _is_secret_descendant(p, secret_paths) for p in changed_paths)
            await self.manager.host.event_bus.publish(
                Event(
                    name=SETTINGS_UPDATED,
                    payload={
                        "namespace": namespace,
                        "plugin_id": plugin_id,
                        "plugin_slug": plugin_slug,
                        "paths": changed_paths,
                        "contains_secrets": contains_secrets,
                    },
                    source="core",
                    actor_user_id=actor_user_id,
                )
            )
        except Exception:
            return

    async def _encrypt_core_secrets(self, schema: ConfigSchema, config: dict[str, Any]) -> dict[str, Any]:
        # Core secrets are encrypted at-rest using the system master key.
        key_path = self.settings.setup.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(
                message=_ts("MASTER_KEY_MISSING", "系统密钥未初始化"),
                error="MASTER_KEY_MISSING",
            )
        key, _fp = ensure_master_key(key_path)

        secret_paths = iter_secret_field_paths(schema)
        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = config.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str):
                continue
            if is_encrypted(raw):
                continue
            aad = f"{CORE_SETTINGS_NAMESPACE}:{path}"
            section[field_key] = encrypt_secret(raw, key=key, aad=aad)

        return config

    async def _encrypt_plugin_secrets(
        self,
        schema: ConfigSchema,
        config: dict[str, Any],
        *,
        namespace: str,
        scope_type: str,
        scope_id: Any,
    ) -> dict[str, Any]:
        """
        Encrypt plugin secrets at-rest using the system master key.

        AAD format (must remain stable across versions):
        - "{scope_type}:{scope_id}:{namespace}:{path}"
        - path is "section.key"
        """

        key_path = self.settings.setup.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(
                message=_ts("MASTER_KEY_MISSING", "系统密钥未初始化"),
                error="MASTER_KEY_MISSING",
            )
        key, _fp = ensure_master_key(key_path)

        secret_paths = iter_secret_field_paths(schema)
        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = config.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str):
                continue
            if is_encrypted(raw):
                continue
            aad = f"{scope_type}:{scope_id}:{namespace}:{path}"
            section[field_key] = encrypt_secret(raw, key=key, aad=aad)

        return config

    def _mask_secrets(self, schema: ConfigSchema, config: dict[str, Any]) -> tuple[dict[str, Any], dict[str, bool]]:
        masked: dict[str, Any] = dict(config or {})
        secrets: dict[str, bool] = {}

        for path in iter_secret_field_paths(schema):
            section_id, field_key = path.split(".", 1)
            section = masked.get(section_id)
            if not isinstance(section, dict):
                secrets[path] = False
                continue
            value = section.get(field_key)
            if value is None:
                secrets[path] = False
                continue
            secrets[path] = True
            section[field_key] = None

        return masked, secrets

    def _to_schema_item(self, schema: ConfigSchema) -> SettingsSchemaItem:
        sections: list[SettingsSectionItem] = []
        for section in schema.sections:
            fields: list[SettingsFieldItem] = []
            for field in section.fields:
                fields.append(
                    SettingsFieldItem(
                        key=field.key,
                        type=field.type,
                        default=field.default,
                        secret=bool(getattr(field, "secret", False)),
                        ui=getattr(field, "ui", None),
                        label=self._translate_ref(field.label_i18n, field.label),
                        description=self._translate_ref(field.description_i18n, field.description),
                    )
                )
            sections.append(
                SettingsSectionItem(
                    id=section.id,
                    title=self._translate_ref(section.title_i18n, section.title),
                    fields=fields,
                )
            )
        return SettingsSchemaItem(sections=sections)

    def _translate_ref(self, ref: str | None, default: str | None) -> str | None:
        if not ref:
            return default
        trimmed = ref.strip()
        if ":" in trimmed:
            namespace, key = trimmed.split(":", 1)
        elif "." in trimmed:
            namespace, key = trimmed.split(".", 1)
        else:
            namespace, key = "settings", trimmed
        namespace = namespace.strip()
        key = key.strip()
        return t(namespace, key, default=default)


def _flatten_patch_paths(patch: dict[str, Any], *, _prefix: str = "") -> list[str]:
    # Only emit keys/paths, never values (could contain secrets).
    out: list[str] = []
    for key, value in (patch or {}).items():
        if not key:
            continue
        path = f"{_prefix}.{key}" if _prefix else str(key)
        if isinstance(value, dict):
            out.extend(_flatten_patch_paths(value, _prefix=path))
        else:
            out.append(path)
    return out


def _is_secret_descendant(path: str, secrets: set[str]) -> bool:
    # If a whole section is patched, treat it as potentially containing secrets.
    prefix = f"{path}."
    for s in secrets:
        if s.startswith(prefix):
            return True
    return False
