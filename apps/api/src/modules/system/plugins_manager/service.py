from __future__ import annotations

import asyncio
import zipfile
from pathlib import Path
from typing import Any

import tomllib
from fastapi import UploadFile
from pydantic import ValidationError

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.src.core.http.pagination import PageData, PageParams
from apps.api.src.core.i18n import t
from apps.api.src.core.logging import get_logger
from apps.api.src.modules.system.admin.menus.seeds import AdminMenuSeedService
from apps.api.src.modules.system.models.plugin import PluginRecord
from apps.api.src.modules.system.plugins_manager.install_service import PluginInstallService, UploadLike
from apps.api.src.modules.system.plugins_manager.repository import PluginRepository
from apps.api.src.modules.system.plugins_manager.schema import (
    PluginConfigFieldItem,
    PluginConfigOptionItem,
    PluginConfigSchemaItem,
    PluginConfigSectionItem,
    PluginDependencyItem,
    PluginDetail,
    PluginPermissionItem,
    PluginSummary,
)
from apps.api.src.plugin.event_bus import Event
from apps.api.src.plugin.events import SETTINGS_UPDATED
from apps.api.src.plugin.manager import PluginManager
from apps.api.src.plugin.manifest import ConfigSchema, PluginManifest, load_plugin_manifest
from apps.api.src.plugin.types import PluginStatus

logger = get_logger(__name__)

_FATAL_PLUGIN_SERVICE_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_PLUGIN_SERVICE_ERRORS):
        raise exc


def _tp(key: str, default: str) -> str:
    return t("plugin", key, default=default)


class PluginService(BaseService):
    def __init__(self, settings: Settings, *, manager: PluginManager | None = None) -> None:
        super().__init__(settings)
        self.repo = PluginRepository()
        self.manager = manager
        self.root_dir = Path(settings.plugin.root_dir)
        self._install = PluginInstallService(
            settings,
            repo=self.repo,
            manager=manager,
            root_dir=self.root_dir,
            merge_config=self._merge_config,
        )

    async def list_plugins(self) -> list[PluginRecord]:
        return await self.repo.list_plugins()

    async def list_plugins_paginated(self, *, params: PageParams) -> PageData[PluginSummary]:
        # Unlike most admin lists, plugin items need manifest-backed fields (e.g. slug)
        # that are not stored in PluginRecord; build the page manually.
        from math import ceil

        qs = self.repo.query_plugins()
        total = int(await qs.count())
        pages = ceil(total / params.size) if params.size else 0

        if total == 0 or params.page > pages:
            items: list[PluginSummary] = []
        else:
            rows = await qs.limit(params.limit).offset(params.offset)
            items = [self.to_summary(row) for row in rows]

        next_page: int | None = None
        prev_page: int | None = None
        if pages > 0:
            if params.page < pages:
                next_page = params.page + 1
            if params.page > 1:
                prev_page = min(params.page - 1, pages)

        return PageData[PluginSummary](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=next_page,
            prev=prev_page,
        )

    async def get_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.repo.get_plugin(plugin_id)
        if record is None:
            raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件不存在"), error="PLUGIN_NOT_FOUND")
        return record

    def resolve_plugin_id(self, plugin_ref: str) -> str:
        """
        Resolve an incoming plugin reference (slug or id) to the canonical plugin id.
        """

        manager = self._require_manager()
        if not manager.descriptors:
            manager.discover()

        # Fast path: canonical id.
        if plugin_ref in manager.descriptors:
            return plugin_ref

        resolved = manager.slug_to_id.get(plugin_ref)
        if resolved:
            return resolved

        raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件不存在"), error="PLUGIN_NOT_FOUND")

    async def install_plugin(
        self,
        *,
        file: UploadLike,
        checksum: str | None,
        enable: bool,
    ) -> tuple[PluginRecord, bool]:
        return await self._install.install_plugin(file=file, checksum=checksum, enable=enable)

    async def validate_upload_to_staging(
        self,
        *,
        file: UploadFile,
        checksum: str | None,
        ttl_seconds: int = 10 * 60,
    ) -> tuple[str, str, int, PluginManifest]:
        return await self._install.validate_upload_to_staging(
            file=file,
            checksum=checksum,
            ttl_seconds=ttl_seconds,
        )

    async def install_from_staging_token(
        self,
        *,
        token: str,
        enable: bool,
    ) -> tuple[PluginRecord, bool]:
        return await self._install.install_from_staging_token(token=token, enable=enable)

    def _sanitize_upload_filename(self, raw_filename: str) -> str:
        return self._install._sanitize_upload_filename(raw_filename)

    async def _save_upload(
        self,
        file: UploadLike,
        dest: Path,
        *,
        max_bytes: int | None = None,
    ) -> tuple[str, int]:
        return await self._install._save_upload(file, dest, max_bytes=max_bytes)

    def _validate_zip(self, zip_path: Path) -> PluginManifest:
        return self._install._validate_zip(zip_path)

    def _safe_extract(self, zf: zipfile.ZipFile, target: Path) -> None:
        self._install._safe_extract(zf, target)

    async def enable_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.get_plugin(plugin_id)
        manager = self._require_manager()
        try:
            await manager.enable(plugin_id)
        except ValueError as exc:
            raise BadRequest(
                message=_tp("PLUGIN_DEPENDENCY_ERROR", "插件依赖错误"),
                error="PLUGIN_DEPENDENCY_ERROR",
                details=str(exc),
            ) from exc
        except KeyError as exc:
            raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件未安装"), error="PLUGIN_NOT_FOUND") from exc
        await record.refresh_from_db()
        # Best-effort: ensure plugin menu seeds exist after enabling.
        try:
            manifest = self._load_manifest(record)
            seeds = list(getattr(manifest, "admin_menu", None) or []) if manifest is not None else []
            if seeds:
                await AdminMenuSeedService(self.settings).ensure_seeds(
                    owner_plugin_id=plugin_id,
                    seeds=seeds,
                    update_existing=False,
                    restore_deleted=True,
                )
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Plugin admin menu seed failed on enable",
                plugin_id=plugin_id,
                action="enable_plugin_seed_admin_menu",
                error=str(exc),
            )
        return record

    async def disable_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.get_plugin(plugin_id)
        manager = self._require_manager()
        try:
            await manager.disable(plugin_id)
        except ValueError as exc:
            raise BadRequest(
                message=_tp("PLUGIN_DEPENDENCY_ERROR", "插件依赖错误"),
                error="PLUGIN_DEPENDENCY_ERROR",
                details=str(exc),
            ) from exc
        except KeyError as exc:
            raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件未安装"), error="PLUGIN_NOT_FOUND") from exc
        await record.refresh_from_db()
        return record

    async def uninstall_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.disable_plugin(plugin_id)
        return record

    async def update_config(self, plugin_id: str, payload: dict[str, Any]) -> tuple[PluginRecord, bool]:
        record = await self.get_plugin(plugin_id)
        if not record.config_schema:
            raise BadRequest(
                message=_tp("PLUGIN_CONFIG_NOT_SUPPORTED", "插件不支持配置"),
                error="PLUGIN_CONFIG_NOT_SUPPORTED",
            )

        schema = ConfigSchema.model_validate(record.config_schema)
        defaults = self._build_defaults_from_schema(schema)
        current = record.config if isinstance(record.config, dict) else {}
        merged = self._merge_config(defaults, current)
        updates = payload.get("config")
        if not isinstance(updates, dict):
            raise BadRequest(
                message=_tp("PLUGIN_CONFIG_INVALID", "插件配置格式不正确"),
                error="PLUGIN_CONFIG_INVALID",
            )
        merged = self._merge_config(merged, updates)
        self._validate_config(schema, merged)
        await self.repo.update_config(record, merged)
        await record.refresh_from_db()
        requires_restart = True
        await self._request_restart(plugin_id, reason="config")
        try:
            desc = None
            if self.manager is not None:
                desc = self.manager.descriptors.get(plugin_id)
                await self.manager.host.event_bus.publish(
                    Event(
                        name=SETTINGS_UPDATED,
                        payload={
                            "namespace": f"plugin:{plugin_id}",
                            "plugin_id": plugin_id,
                            "plugin_slug": desc.manifest.plugin.slug if desc is not None else None,
                            "paths": list(_flatten_patch_paths(updates)),
                        },
                        source="core",
                    )
                )
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Plugin settings update event publish failed",
                plugin_id=plugin_id,
                action="publish_plugin_settings_updated_event",
                event_name=SETTINGS_UPDATED,
                error=str(exc),
            )
        return record, requires_restart

    def to_detail(self, record: PluginRecord) -> PluginDetail:
        detail = PluginDetail.model_validate(record)
        manifest = self._load_manifest(record)
        if manifest is None:
            return detail
        update = self._localized_fields(manifest)
        update["management_scope"] = manifest.plugin.management_scope
        update["slug"] = manifest.plugin.slug
        update["dependencies"] = self._build_dependency_report(manifest)
        return detail.model_copy(update=update)

    def to_summary(self, record: PluginRecord) -> PluginSummary:
        summary = PluginSummary.model_validate(record)
        manifest = self._load_manifest(record)
        if manifest is None:
            return summary
        update = self._localized_fields(manifest, include_schema=False)
        update["management_scope"] = manifest.plugin.management_scope
        update["slug"] = manifest.plugin.slug
        return summary.model_copy(update=update)

    def _build_dependency_report(self, manifest: PluginManifest) -> list[PluginDependencyItem] | None:
        deps = getattr(manifest, "dependencies", None) or []
        if not deps:
            return None
        if self.manager is None:
            return None

        from packaging.specifiers import InvalidSpecifier, SpecifierSet
        from packaging.version import InvalidVersion, Version

        items: list[PluginDependencyItem] = []
        for dep in deps:
            installed_version: str | None = None
            status = "ok"
            detail: str | None = None

            dep_record = self.manager.records.get(dep.id)
            dep_desc = self.manager.descriptors.get(dep.id)
            if dep_record is not None:
                installed_version = dep_record.version
                if dep_record.status == PluginStatus.DISABLED:
                    status = "disabled"
                elif dep_record.status == PluginStatus.FAILED:
                    status = "failed"
            elif dep_desc is not None:
                installed_version = dep_desc.manifest.plugin.version
            else:
                if dep.optional:
                    detail = "Optional dependency not installed"
                    status = "ok"
                else:
                    status = "missing"

            if status == "ok" and dep.version and installed_version:
                try:
                    if Version(installed_version) not in SpecifierSet(dep.version):
                        status = "version_mismatch"
                        detail = f"Installed {installed_version} does not satisfy {dep.version}"
                except (InvalidVersion, InvalidSpecifier, TypeError, ValueError) as exc:
                    status = "version_mismatch"
                    detail = (
                        f"Invalid version comparison (installed={installed_version}, spec={dep.version}, error={exc})"
                    )

            items.append(
                PluginDependencyItem(
                    plugin_id=dep.id,
                    version=dep.version,
                    optional=bool(dep.optional),
                    status=status,
                    installed_version=installed_version,
                    detail=detail,
                )
            )
        return items

    def _require_manager(self) -> PluginManager:
        if self.manager is None:
            raise ServiceUnavailable(
                message=_tp("PLUGIN_MANAGER_UNAVAILABLE", "插件管理器不可用"),
                error="PLUGIN_MANAGER_UNAVAILABLE",
            )
        return self.manager

    def _load_manifest(self, record: PluginRecord) -> PluginManifest | None:
        if self.manager is not None:
            descriptor = self.manager.descriptors.get(record.plugin_id)
            if descriptor is not None:
                return descriptor.manifest
        manifest_path = Path(record.storage_path) / "plugin.toml"
        if not manifest_path.is_file():
            return None
        try:
            return load_plugin_manifest(manifest_path)
        except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError, ValidationError, ValueError) as exc:
            logger.warning(
                "Plugin manifest load failed",
                plugin_id=record.plugin_id,
                action="load_plugin_manifest",
                manifest_path=str(manifest_path),
                error=str(exc),
            )
            return None

    def _localized_fields(self, manifest: PluginManifest, *, include_schema: bool = True) -> dict[str, Any]:
        name = self._translate_ref(manifest.plugin.name_i18n, manifest.plugin.name)
        description = self._translate_ref(manifest.plugin.description_i18n, manifest.plugin.description)
        payload: dict[str, Any] = {"name": name, "description": description}
        if include_schema:
            payload["permissions"] = self._localize_permissions(manifest.permissions)
            payload["config_schema"] = self._localize_config_schema(manifest.config_schema)
        return payload

    def _localize_permissions(self, permissions: list[Any]) -> list[PluginPermissionItem] | None:
        if not permissions:
            return None
        items: list[PluginPermissionItem] = []
        for perm in permissions:
            items.append(
                PluginPermissionItem(
                    code=perm.code,
                    name=self._translate_ref(perm.name_i18n, perm.name),
                    description=self._translate_ref(perm.description_i18n, perm.description),
                    default_roles=list(perm.default_roles),
                )
            )
        return items

    def _localize_config_schema(self, schema: ConfigSchema | None) -> PluginConfigSchemaItem | None:
        if schema is None:
            return None
        sections: list[PluginConfigSectionItem] = []
        for section in schema.sections:
            fields: list[PluginConfigFieldItem] = []
            for field in section.fields:
                options: list[PluginConfigOptionItem] = []
                for opt in getattr(field, "options", []) or []:
                    options.append(
                        PluginConfigOptionItem(
                            value=getattr(opt, "value", None),
                            label=self._translate_ref(getattr(opt, "label_i18n", None), getattr(opt, "label", None)),
                            description=self._translate_ref(
                                getattr(opt, "description_i18n", None),
                                getattr(opt, "description", None),
                            ),
                        )
                    )
                fields.append(
                    PluginConfigFieldItem(
                        key=field.key,
                        type=field.type,
                        default=field.default,
                        secret=bool(getattr(field, "secret", False)),
                        options=options,
                        ui=getattr(field, "ui", None),
                        label=self._translate_ref(field.label_i18n, field.label),
                        description=self._translate_ref(field.description_i18n, field.description),
                    )
                )
            sections.append(
                PluginConfigSectionItem(
                    id=section.id,
                    title=self._translate_ref(section.title_i18n, section.title),
                    fields=fields,
                )
            )
        return PluginConfigSchemaItem(sections=sections)

    def _translate_ref(self, ref: str | None, default: str | None) -> str | None:
        if not ref:
            return default
        namespace, key = self._split_i18n_ref(ref)
        if not namespace or not key:
            return default
        return t(namespace, key, default=default)

    @staticmethod
    def _split_i18n_ref(ref: str) -> tuple[str, str]:
        trimmed = ref.strip()
        if ":" in trimmed:
            namespace, key = trimmed.split(":", 1)
        elif "." in trimmed:
            namespace, key = trimmed.split(".", 1)
        else:
            return "plugin", trimmed
        return namespace.strip(), key.strip()

    def _merge_config(self, current: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
        merged = dict(current or {})
        for section, values in updates.items():
            if section not in merged or not isinstance(merged[section], dict):
                merged[section] = dict(values) if isinstance(values, dict) else values
            else:
                if isinstance(values, dict):
                    for key, value in values.items():
                        merged[section][key] = value
                else:
                    merged[section] = values
        return merged

    def _build_defaults_from_schema(self, schema: ConfigSchema) -> dict[str, Any]:
        defaults: dict[str, Any] = {}
        for section in schema.sections:
            section_values: dict[str, Any] = {}
            for field in section.fields:
                if field.default is not None:
                    section_values[field.key] = field.default
            if section_values:
                defaults[section.id] = section_values
        return defaults

    def _validate_config(self, schema: ConfigSchema, config: dict[str, Any]) -> None:
        # Keep backward compatibility: allow unknown fields/sections but validate known ones.
        from apps.api.src.settings.validation import validate_config_schema

        try:
            validate_config_schema(schema, config, allow_unknown=True)
        except BadRequest as exc:
            # Preserve the plugin error code for existing clients.
            raise BadRequest(
                message=exc.message,
                error="PLUGIN_CONFIG_INVALID",
                details=getattr(exc, "details", None),
            ) from exc

    def _is_type_valid(self, field_type: str, value: Any) -> bool:
        if field_type == "str":
            return isinstance(value, str)
        if field_type == "int":
            return isinstance(value, int) and not isinstance(value, bool)
        if field_type == "float":
            return isinstance(value, (int, float)) and not isinstance(value, bool)
        if field_type == "bool":
            return isinstance(value, bool)
        if field_type == "list":
            return isinstance(value, list)
        if field_type == "dict":
            return isinstance(value, dict)
        return False

    async def _request_restart(self, plugin_id: str, *, reason: str) -> None:
        if self.manager is None:
            return
        await self.manager.request_restart(plugin_id, reason=reason)

    def validate_config_payload(self, schema: ConfigSchema, config: dict[str, Any]) -> None:
        """
        Validate a config payload against a plugin config schema.

        Notes:
        - This is a public API for other modules (e.g. workspace plugin center).
        - It preserves the same validation rules as global plugin config updates.
        """

        self._validate_config(schema, config)


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
