from __future__ import annotations

import hashlib
import shutil
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import tomllib
from fastapi import UploadFile

from apps.api.common.services import BaseService
from apps.api.common.utils.ids import uuid7
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams
from apps.api.core.i18n import t
from apps.api.core.logging import get_logger
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.modules.system.plugins_manager.repository import PluginRepository
from apps.api.modules.system.plugins_manager.schema import (
    PluginConfigFieldItem,
    PluginConfigSchemaItem,
    PluginConfigSectionItem,
    PluginDependencyItem,
    PluginDetail,
    PluginPermissionItem,
    PluginSummary,
)
from apps.api.plugin.event_bus import Event
from apps.api.plugin.events import PLUGIN_INSTALLED, SETTINGS_UPDATED
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.manifest import ConfigSchema, PluginManifest, build_default_config, load_plugin_manifest
from apps.api.plugin.types import PluginStatus

logger = get_logger(__name__)


def _tp(key: str, default: str) -> str:
    return t("plugin", key, default=default)


class PluginService(BaseService):
    def __init__(self, settings: Settings, *, manager: PluginManager | None = None) -> None:
        super().__init__(settings)
        self.repo = PluginRepository()
        self.manager = manager
        self.root_dir = Path(settings.plugin.root_dir)

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
        file: UploadFile,
        checksum: str | None,
        enable: bool,
    ) -> tuple[PluginRecord, bool]:
        if not file.filename:
            raise BadRequest(message=_tp("PLUGIN_PACKAGE_REQUIRED", "缺少插件包文件"), error="PLUGIN_PACKAGE_REQUIRED")
        if not file.filename.endswith(".zip"):
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包必须为 zip 格式"),
                error="PLUGIN_PACKAGE_INVALID",
            )

        staging_dir = self.root_dir / ".staging" / uuid7().hex
        staging_dir.mkdir(parents=True, exist_ok=True)
        zip_path = staging_dir / file.filename

        try:
            sha256, size = await self._save_upload(file, zip_path)
            if checksum and checksum.lower() != sha256:
                raise BadRequest(
                    message=_tp("PLUGIN_CHECKSUM_MISMATCH", "插件包校验失败"),
                    error="PLUGIN_CHECKSUM_MISMATCH",
                )

            manifest = self._validate_zip(zip_path)
            plugin_id = manifest.plugin.id
            slug = manifest.plugin.slug

            # Hard fail on slug conflicts.
            if self.manager is not None:
                if not self.manager.descriptors:
                    self.manager.discover()
                existing = self.manager.slug_to_id.get(slug)
                if existing and existing != plugin_id:
                    raise BadRequest(
                        message=_tp("PLUGIN_SLUG_CONFLICT", "插件 slug 冲突"),
                        error="PLUGIN_SLUG_CONFLICT",
                        details=f"slug={slug} conflicts with {existing}",
                    )

            existing = await self.repo.get_plugin(plugin_id)
            if existing and existing.status == PluginStatus.STARTED and self.manager is not None:
                await self.manager.disable(plugin_id)

            payload_dir = staging_dir / "payload"
            payload_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(zip_path) as zf:
                self._safe_extract(zf, payload_dir)

            if not (payload_dir / "plugin.toml").is_file():
                raise BadRequest(
                    message=_tp("PLUGIN_TOML_MISSING", "插件包缺少 plugin.toml"),
                    error="PLUGIN_TOML_MISSING",
                )
            entry_root = self._get_entry_root(manifest)
            if not (payload_dir / entry_root).is_dir() and not (payload_dir / "src" / entry_root).is_dir():
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_MISSING", "插件包缺少主包目录"),
                    error="PLUGIN_PACKAGE_MISSING",
                )

            target_dir = self.root_dir / plugin_id
            backup_dir = None
            if target_dir.exists():
                backup_dir = self._backup_plugin_dir(plugin_id, target_dir)

            try:
                self.root_dir.mkdir(parents=True, exist_ok=True)
                shutil.move(str(payload_dir), str(target_dir))
            except Exception as exc:
                if backup_dir and not target_dir.exists() and backup_dir.exists():
                    shutil.move(str(backup_dir), str(target_dir))
                raise BadRequest(
                    message=_tp("PLUGIN_INSTALL_FAILED", "插件包安装失败"),
                    error="PLUGIN_INSTALL_FAILED",
                    details=str(exc),
                ) from exc
        finally:
            shutil.rmtree(staging_dir, ignore_errors=True)

        config_schema = manifest.config_schema.model_dump() if manifest.config_schema else None
        permissions = [perm.model_dump() for perm in manifest.permissions]
        defaults = build_default_config(manifest)
        status = PluginStatus.INSTALLED if enable else PluginStatus.DISABLED

        if existing is None:
            record = await self.repo.create_plugin(
                plugin_id=plugin_id,
                name=manifest.plugin.name,
                description=manifest.plugin.description,
                author=manifest.plugin.author,
                version=manifest.plugin.version,
                requires=manifest.plugin.requires,
                entrypoint=manifest.plugin.entrypoint,
                website=manifest.plugin.website,
                repository=manifest.plugin.repository,
                issues=manifest.plugin.issues,
                license_name=manifest.plugin.license,
                status=status,
                storage_path=str(target_dir),
                permissions=permissions,
                config_schema=config_schema,
                config=defaults or None,
                package_filename=file.filename,
                package_checksum=sha256,
                package_size=size,
            )
        else:
            config = self._merge_config(existing.config or {}, defaults)
            record = await self.repo.update_plugin(
                existing,
                name=manifest.plugin.name,
                description=manifest.plugin.description,
                author=manifest.plugin.author,
                version=manifest.plugin.version,
                requires=manifest.plugin.requires,
                entrypoint=manifest.plugin.entrypoint,
                website=manifest.plugin.website,
                repository=manifest.plugin.repository,
                issues=manifest.plugin.issues,
                license_name=manifest.plugin.license,
                status=status,
                storage_path=str(target_dir),
                permissions=permissions,
                config_schema=config_schema,
                config=config or None,
                package_filename=file.filename,
                package_checksum=sha256,
                package_size=size,
            )

        requires_restart = True
        await self._request_restart(plugin_id, reason="install")
        # Fire an event so other parts (e.g. UI/menu/diagnostics) can react without hard coupling.
        try:
            if self.manager is not None:
                await self.manager.registry.event_bus.publish(
                    Event(
                        name=PLUGIN_INSTALLED,
                        payload={
                            "plugin_id": plugin_id,
                            "slug": slug,
                            "version": manifest.plugin.version,
                            "status": str(record.status),
                            "requires_restart": requires_restart,
                        },
                        source="core",
                    )
                )
        except Exception:
            pass
        return record, requires_restart

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
                await self.manager.registry.event_bus.publish(
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
        except Exception:
            pass
        return record, requires_restart

    def to_detail(self, record: PluginRecord) -> PluginDetail:
        detail = PluginDetail.model_validate(record)
        manifest = self._load_manifest(record)
        if manifest is None:
            return detail
        update = self._localized_fields(manifest)
        update["slug"] = manifest.plugin.slug
        update["dependencies"] = self._build_dependency_report(manifest)
        return detail.model_copy(update=update)

    def to_summary(self, record: PluginRecord) -> PluginSummary:
        summary = PluginSummary.model_validate(record)
        manifest = self._load_manifest(record)
        if manifest is None:
            return summary
        update = self._localized_fields(manifest, include_schema=False)
        update["slug"] = manifest.plugin.slug
        return summary.model_copy(update=update)

    def _build_dependency_report(self, manifest: PluginManifest) -> list[PluginDependencyItem] | None:
        deps = getattr(manifest, "dependencies", None) or []
        if not deps:
            return None
        if self.manager is None:
            return None

        from packaging.specifiers import SpecifierSet
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
                except (InvalidVersion, Exception):
                    status = "version_mismatch"
                    detail = f"Invalid version comparison (installed={installed_version}, spec={dep.version})"

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
        except Exception as exc:
            logger.warning("Plugin manifest load failed", plugin_id=record.plugin_id, error=str(exc))
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
                fields.append(
                    PluginConfigFieldItem(
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

    async def _save_upload(self, file: UploadFile, dest: Path) -> tuple[str, int]:
        digest = hashlib.sha256()
        size = 0
        with dest.open("wb") as handle:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                digest.update(chunk)
                size += len(chunk)
        await file.close()
        return digest.hexdigest(), size

    def _validate_zip(self, zip_path: Path) -> PluginManifest:
        with zipfile.ZipFile(zip_path) as zf:
            names = zf.namelist()
            if "plugin.toml" not in names:
                raise BadRequest(
                    message=_tp("PLUGIN_TOML_MISSING", "插件包缺少 plugin.toml"),
                    error="PLUGIN_TOML_MISSING",
                )

            manifest = self._load_manifest_from_zip(zf)
            self._validate_manifest(manifest)
            return manifest

    def _load_manifest_from_zip(self, zf: zipfile.ZipFile) -> PluginManifest:
        raw = zf.read("plugin.toml")
        payload = tomllib.loads(raw.decode("utf-8"))
        return PluginManifest.model_validate(payload)

    def _validate_manifest(self, manifest: PluginManifest) -> None:
        self._get_entry_root(manifest)

    def _get_entry_root(self, manifest: PluginManifest) -> str:
        entrypoint = manifest.plugin.entrypoint
        entry_module = entrypoint.split(":", 1)[0]
        entry_root = entry_module.split(".", 1)[0]
        if not entry_root:
            raise BadRequest(
                message=_tp("PLUGIN_ENTRYPOINT_INVALID", "插件入口不合法"),
                error="PLUGIN_ENTRYPOINT_INVALID",
            )
        return entry_root

    def _safe_extract(self, zf: zipfile.ZipFile, target: Path) -> None:
        for member in zf.infolist():
            name = member.filename
            if name.startswith("/") or name.startswith("\\"):
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_INVALID", "插件包路径非法"),
                    error="PLUGIN_PACKAGE_INVALID",
                )
            normalized = Path(name)
            if ".." in normalized.parts:
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_INVALID", "插件包路径非法"),
                    error="PLUGIN_PACKAGE_INVALID",
                )
            resolved = (target / normalized).resolve()
            if not str(resolved).startswith(str(target.resolve())):
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_INVALID", "插件包路径非法"),
                    error="PLUGIN_PACKAGE_INVALID",
                )
        zf.extractall(target)

    def _backup_plugin_dir(self, plugin_id: str, target_dir: Path) -> Path:
        timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        backup_root = self.root_dir / ".backup" / plugin_id / timestamp
        backup_root.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(target_dir), str(backup_root))
        return backup_root

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
        from apps.api.settings.validation import validate_config_schema

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
