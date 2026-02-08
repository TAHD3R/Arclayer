from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from tortoise.exceptions import OperationalError

from apps.api.common.protocols.tortoise import SettingUpdatedBy
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.modules.organization.plugins.repository import OrganizationPluginRepository
from apps.api.modules.organization.plugins.schema import OrganizationPluginSummary
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.modules.system.models.setting import SettingRecord
from apps.api.modules.system.plugins_manager.service import PluginService
from apps.api.modules.system.settings.schema import SettingsDetail, SettingsPatch, SettingsSchemaItem
from apps.api.plugin.manifest import ConfigSchema, build_default_config
from apps.api.settings.crypto import encrypt_secret, ensure_master_key, is_encrypted, master_key_exists
from apps.api.settings.runtime_plugins import get_org_plugin_settings_decrypted
from apps.api.settings.scopes import SCOPE_TYPE_ORG
from apps.api.settings.validation import iter_secret_field_paths, merge_deep

_ORG_PLUGIN_STATE_ERRORS = (OperationalError, RuntimeError, ValueError, TypeError)


class OrganizationPluginService(BaseService):
    def __init__(self, settings: Settings, *, plugin_service: PluginService) -> None:
        super().__init__(settings)
        self.repo = OrganizationPluginRepository()
        self.plugin_service = plugin_service

    async def list_org_plugins(self, *, organization_id: UUID) -> list[OrganizationPluginSummary]:
        rows = await PluginRecord.all().order_by("created_at").all()
        try:
            state_rows = await self.repo.list_states(organization_id=organization_id)
        except _ORG_PLUGIN_STATE_ERRORS as exc:
            raise ServiceUnavailable(
                message=t("plugin", "PLUGIN_DISABLED", default="组织插件状态不可用"),
                error="ORG_PLUGIN_STATE_UNAVAILABLE",
            ) from exc
        state_by_id = {str(s.plugin_id): s for s in state_rows if s.plugin_id}

        items: list[OrganizationPluginSummary] = []
        for record in rows:
            if not self._is_org_scope(record):
                continue

            summary = self.plugin_service.to_summary(record)
            category, requires, license_name, has_config_schema = self._resolve_manifest_meta(record)
            state = state_by_id.get(str(record.plugin_id))
            enabled = bool(state.enabled) if state is not None else False

            items.append(
                OrganizationPluginSummary(
                    plugin_id=str(summary.plugin_id),
                    management_scope=str(summary.management_scope),
                    slug=summary.slug,
                    name=str(summary.name),
                    description=summary.description,
                    version=str(summary.version),
                    requires=requires,
                    author=str(summary.author),
                    license=license_name,
                    status=str(summary.status),
                    category=category,
                    has_config_schema=has_config_schema,
                    enabled=enabled,
                )
            )
        return items

    async def set_enabled(
        self,
        *,
        organization_id: UUID,
        plugin_id: str,
        enabled: bool,
    ) -> OrganizationPluginSummary:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None:
            raise NotFound(message=t("plugin", "PLUGIN_NOT_FOUND", default="插件不存在"), error="PLUGIN_NOT_FOUND")
        self._assert_org_scope(record)

        try:
            state = await self.repo.set_enabled(organization_id=organization_id, plugin_id=plugin_id, enabled=enabled)
        except _ORG_PLUGIN_STATE_ERRORS as exc:
            raise ServiceUnavailable(
                message=t("plugin", "PLUGIN_DISABLED", default="组织插件状态不可用"),
                error="ORG_PLUGIN_STATE_UNAVAILABLE",
            ) from exc
        summary = self.plugin_service.to_summary(record)
        category, requires, license_name, has_config_schema = self._resolve_manifest_meta(record)
        return OrganizationPluginSummary(
            plugin_id=str(summary.plugin_id),
            management_scope=str(summary.management_scope),
            slug=summary.slug,
            name=str(summary.name),
            description=summary.description,
            version=str(summary.version),
            requires=requires,
            author=str(summary.author),
            license=license_name,
            status=str(summary.status),
            category=category,
            has_config_schema=has_config_schema,
            enabled=bool(state.enabled),
        )

    async def get_plugin_settings_detail(self, *, organization_id: UUID, plugin_id: str) -> SettingsDetail:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None:
            raise NotFound(message=t("plugin", "PLUGIN_NOT_FOUND", default="插件不存在"), error="PLUGIN_NOT_FOUND")
        self._assert_org_scope(record)

        schema, defaults = self._resolve_schema(record)
        if schema is None:
            raise BadRequest(
                message=t("plugin", "PLUGIN_CONFIG_NOT_SUPPORTED", default="插件不支持配置"),
                error="PLUGIN_CONFIG_NOT_SUPPORTED",
            )

        config = await get_org_plugin_settings_decrypted(
            self.settings,
            organization_id=organization_id,
            plugin_id=plugin_id,
            schema=schema,
            defaults=defaults,
        )
        masked, secrets = self._mask_secrets(schema, config)

        namespace = f"plugin:{plugin_id}"
        setting = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_ORG,
            scope_id=organization_id,
            namespace=namespace,
        )
        localized = self.plugin_service._localize_config_schema(schema)
        schema_out = (
            SettingsSchemaItem.model_validate(localized.model_dump())
            if localized is not None
            else SettingsSchemaItem(sections=[])
        )
        return SettingsDetail(
            namespace=namespace,
            setting_schema=schema_out,
            value=masked,
            secrets=secrets,
            updated_at=setting.updated_at if setting is not None else None,
        )

    async def patch_plugin_settings(
        self,
        *,
        organization_id: UUID,
        plugin_id: str,
        payload: SettingsPatch,
        updated_by: UUID | None,
    ) -> SettingsDetail:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None:
            raise NotFound(message=t("plugin", "PLUGIN_NOT_FOUND", default="插件不存在"), error="PLUGIN_NOT_FOUND")
        self._assert_org_scope(record)

        schema, defaults = self._resolve_schema(record)
        if schema is None:
            raise BadRequest(
                message=t("plugin", "PLUGIN_CONFIG_NOT_SUPPORTED", default="插件不支持配置"),
                error="PLUGIN_CONFIG_NOT_SUPPORTED",
            )

        namespace = f"plugin:{plugin_id}"
        current = await get_org_plugin_settings_decrypted(
            self.settings,
            organization_id=organization_id,
            plugin_id=plugin_id,
            schema=schema,
            defaults=defaults,
        )
        merged = merge_deep(current, payload.patch)
        self.plugin_service.validate_config_payload(schema, merged)
        merged = await self._encrypt_plugin_secrets(
            schema,
            merged,
            namespace=namespace,
            organization_id=organization_id,
        )

        setting = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_ORG,
            scope_id=organization_id,
            namespace=namespace,
        )
        if setting is None:
            setting = await SettingRecord.create(
                scope_type=SCOPE_TYPE_ORG,
                scope_id=organization_id,
                namespace=namespace,
                value=merged,
                updated_by=updated_by,
            )
        else:
            setting.value = merged
            cast(SettingUpdatedBy, setting).updated_by = updated_by
            await setting.save()

        decrypted = await get_org_plugin_settings_decrypted(
            self.settings,
            organization_id=organization_id,
            plugin_id=plugin_id,
            schema=schema,
            defaults=defaults,
        )
        masked, secrets = self._mask_secrets(schema, decrypted)
        localized = self.plugin_service._localize_config_schema(schema)
        schema_out = (
            SettingsSchemaItem.model_validate(localized.model_dump())
            if localized is not None
            else SettingsSchemaItem(sections=[])
        )
        return SettingsDetail(
            namespace=namespace,
            setting_schema=schema_out,
            value=masked,
            secrets=secrets,
            updated_at=setting.updated_at,
        )

    async def reset_plugin_settings(self, *, organization_id: UUID, plugin_id: str) -> None:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None:
            raise NotFound(message=t("plugin", "PLUGIN_NOT_FOUND", default="插件不存在"), error="PLUGIN_NOT_FOUND")
        self._assert_org_scope(record)

        namespace = f"plugin:{plugin_id}"
        await SettingRecord.filter(
            scope_type=SCOPE_TYPE_ORG,
            scope_id=organization_id,
            namespace=namespace,
        ).delete()

    async def uninstall_from_organization(self, *, organization_id: UUID, plugin_id: str) -> None:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None:
            raise NotFound(message=t("plugin", "PLUGIN_NOT_FOUND", default="插件不存在"), error="PLUGIN_NOT_FOUND")
        self._assert_org_scope(record)

        namespace = f"plugin:{plugin_id}"
        await self.repo.clear_state(organization_id=organization_id, plugin_id=plugin_id)
        await SettingRecord.filter(
            scope_type=SCOPE_TYPE_ORG,
            scope_id=organization_id,
            namespace=namespace,
        ).delete()

    def _resolve_manifest_meta(self, record: PluginRecord) -> tuple[str | None, str | None, str | None, bool]:
        manager = getattr(self.plugin_service, "manager", None)
        if manager is not None:
            if not getattr(manager, "descriptors", None):
                manager.discover()
            desc = manager.descriptors.get(str(record.plugin_id))
        else:
            desc = None

        category = (desc.manifest.plugin.category if desc is not None else None) or None
        requires = (desc.manifest.plugin.requires if desc is not None else None) or None
        license_name = (desc.manifest.plugin.license if desc is not None else None) or None
        has_config_schema = (
            bool(getattr(desc.manifest, "config_schema", None)) if desc is not None else bool(record.config_schema)
        )
        return category, requires, license_name, has_config_schema

    def _resolve_schema(self, record: PluginRecord) -> tuple[ConfigSchema | None, dict[str, Any]]:
        manager = getattr(self.plugin_service, "manager", None)
        if manager is not None:
            if not getattr(manager, "descriptors", None):
                manager.discover()
            desc = manager.descriptors.get(str(record.plugin_id))
        else:
            desc = None

        if desc is not None:
            schema = desc.manifest.config_schema
            defaults = build_default_config(desc.manifest)
            return schema, defaults

        if not record.config_schema:
            return None, {}
        schema = ConfigSchema.model_validate(record.config_schema)
        # Fallback when descriptor is missing: derive defaults directly from schema.
        base: dict[str, Any] = {}
        for section in schema.sections:
            values: dict[str, Any] = {}
            for field in section.fields:
                if field.default is not None:
                    values[field.key] = field.default
            if values:
                base[section.id] = values
        return schema, base

    def _is_org_scope(self, record: PluginRecord) -> bool:
        return self._resolve_management_scope(plugin_id=str(record.plugin_id)) == "organization"

    def _assert_org_scope(self, record: PluginRecord) -> None:
        if self._is_org_scope(record):
            return
        raise BadRequest(
            message=t("plugin", "PLUGIN_SCOPE_MISMATCH", default="插件作用域与当前管理入口不匹配"),
            error="PLUGIN_SCOPE_MISMATCH",
            details={
                "management_scope": self._resolve_management_scope(plugin_id=str(record.plugin_id)),
                "expected_scope": "organization",
            },
        )

    def _resolve_management_scope(self, *, plugin_id: str) -> str:
        manager = getattr(self.plugin_service, "manager", None)
        if manager is None:
            return "workspace"
        if not getattr(manager, "descriptors", None):
            manager.discover()
        desc = manager.descriptors.get(str(plugin_id))
        if desc is None:
            return "workspace"
        return (desc.manifest.plugin.management_scope or "workspace").strip().lower()

    async def _encrypt_plugin_secrets(
        self,
        schema: ConfigSchema,
        config: dict[str, Any],
        *,
        namespace: str,
        organization_id: UUID,
    ) -> dict[str, Any]:
        key_path = self.settings.setup.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(
                message=t("settings", "MASTER_KEY_MISSING", default="系统密钥未初始化"),
                error="MASTER_KEY_MISSING",
            )
        key, _fp = ensure_master_key(key_path)

        for path in iter_secret_field_paths(schema):
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
            aad = f"{SCOPE_TYPE_ORG}:{organization_id}:{namespace}:{path}"
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
