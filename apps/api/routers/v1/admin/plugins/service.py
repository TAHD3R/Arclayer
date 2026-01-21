from __future__ import annotations

import hashlib
import shutil
import tomllib
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import UploadFile

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.core.i18n import t
from apps.api.core.logging import get_logger
from apps.api.models.plugin import PluginRecord
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.manifest import ConfigSchema, PluginManifest, build_default_config
from apps.api.plugin.types import PluginStatus
from apps.api.routers.v1.admin.plugins.repository import PluginRepository
from apps.api.routers.v1.admin.plugins.schema import PluginDetail

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

    async def get_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.repo.get_plugin(plugin_id)
        if record is None:
            raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件不存在"), error="PLUGIN_NOT_FOUND")
        return record

    async def install_plugin(  # noqa: C901
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

        staging_dir = self.root_dir / ".staging" / uuid4().hex
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
            if not (payload_dir / entry_root).is_dir():
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
        return record, requires_restart

    async def enable_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.get_plugin(plugin_id)
        manager = self._require_manager()
        try:
            await manager.enable(plugin_id)
        except KeyError as exc:
            raise NotFound(message=_tp("PLUGIN_NOT_FOUND", "插件未安装"), error="PLUGIN_NOT_FOUND") from exc
        await record.refresh_from_db()
        return record

    async def disable_plugin(self, plugin_id: str) -> PluginRecord:
        record = await self.get_plugin(plugin_id)
        manager = self._require_manager()
        try:
            await manager.disable(plugin_id)
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
        return record, requires_restart

    def to_detail(self, record: PluginRecord) -> PluginDetail:
        return PluginDetail.model_validate(record)

    def _require_manager(self) -> PluginManager:
        if self.manager is None:
            raise ServiceUnavailable(
                message=_tp("PLUGIN_MANAGER_UNAVAILABLE", "插件管理器不可用"),
                error="PLUGIN_MANAGER_UNAVAILABLE",
            )
        return self.manager

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
        sections = {section.id: section for section in schema.sections}
        for section_id, values in config.items():
            section = sections.get(section_id)
            if section is None:
                raise BadRequest(
                    message=_tp("PLUGIN_CONFIG_ITEM_INVALID", "插件配置项不合法"),
                    error="PLUGIN_CONFIG_INVALID",
                )
            if not isinstance(values, dict):
                raise BadRequest(
                    message=_tp("PLUGIN_CONFIG_ITEM_INVALID", "插件配置项不合法"),
                    error="PLUGIN_CONFIG_INVALID",
                )
            fields = {field.key: field for field in section.fields}
            for key, value in values.items():
                field = fields.get(key)
                if field is None:
                    raise BadRequest(
                        message=_tp("PLUGIN_CONFIG_ITEM_INVALID", "插件配置项不合法"),
                        error="PLUGIN_CONFIG_INVALID",
                    )
                if value is None:
                    continue
                if not self._is_type_valid(field.type, value):
                    raise BadRequest(
                        message=_tp("PLUGIN_CONFIG_TYPE_INVALID", "插件配置项类型不正确"),
                        error="PLUGIN_CONFIG_INVALID",
                    )

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
