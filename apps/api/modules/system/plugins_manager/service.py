from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
import stat
import time
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

import tomllib
from fastapi import UploadFile
from pydantic import ValidationError

from apps.api.common.services import BaseService
from apps.api.common.utils.ids import uuid7
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from apps.api.core.http.pagination import PageData, PageParams
from apps.api.core.i18n import t
from apps.api.core.logging import get_logger
from apps.api.modules.system.admin.menus.seeds import AdminMenuSeedService
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.modules.system.plugins_manager.repository import PluginRepository
from apps.api.modules.system.plugins_manager.schema import (
    PluginConfigFieldItem,
    PluginConfigSchemaItem,
    PluginConfigSectionItem,
    PluginConfigOptionItem,
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


@dataclass(frozen=True)
class _InstallLockEntry:
    loop_id: int
    lock: asyncio.Lock


_INSTALL_LOCKS: dict[str, _InstallLockEntry] = {}


def _get_install_lock(plugin_id: str) -> asyncio.Lock:
    # Keep locking per-event-loop to avoid cross-loop asyncio.Lock reuse in tests.
    loop = asyncio.get_running_loop()
    loop_id = id(loop)
    key = str(plugin_id)
    entry = _INSTALL_LOCKS.get(key)
    if entry is None or entry.loop_id != loop_id:
        lock = asyncio.Lock()
        _INSTALL_LOCKS[key] = _InstallLockEntry(loop_id=loop_id, lock=lock)
        return lock
    return entry.lock


class _UploadLike(Protocol):
    filename: str | None

    async def read(self, size: int = -1) -> bytes: ...

    async def close(self) -> None: ...


class PluginService(BaseService):
    def __init__(self, settings: Settings, *, manager: PluginManager | None = None) -> None:
        super().__init__(settings)
        self.repo = PluginRepository()
        self.manager = manager
        self.root_dir = Path(settings.plugin.root_dir)

    def _sanitize_upload_filename(self, raw_filename: str) -> str:
        """
        Sanitize an upload filename to a safe basename.

        We treat both "/" and "\\" as separators and reject traversal segments ("..").
        """

        normalized = (raw_filename or "").replace("\\", "/")
        if ".." in Path(normalized).parts:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包文件名不合法"),
                error="PLUGIN_PACKAGE_INVALID",
                details={"filename": raw_filename},
            )
        filename = Path(normalized).name
        if not filename or filename in {".", ".."}:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包文件名不合法"),
                error="PLUGIN_PACKAGE_INVALID",
                details={"filename": raw_filename},
            )
        return filename

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
        file: _UploadLike,
        checksum: str | None,
        enable: bool,
    ) -> tuple[PluginRecord, bool]:
        if not file.filename:
            raise BadRequest(message=_tp("PLUGIN_PACKAGE_REQUIRED", "缺少插件包文件"), error="PLUGIN_PACKAGE_REQUIRED")
        raw_filename = file.filename
        filename = self._sanitize_upload_filename(raw_filename)
        if not filename.endswith(".zip"):
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包必须为 zip 格式"),
                error="PLUGIN_PACKAGE_INVALID",
            )

        staging_dir = self.root_dir / ".staging" / uuid7().hex
        staging_dir.mkdir(parents=True, exist_ok=True)
        zip_path = staging_dir / filename

        manifest: PluginManifest | None = None
        plugin_id: str | None = None
        slug: str | None = None
        sha256: str | None = None
        size: int | None = None
        target_dir: Path | None = None
        backup_dir: Path | None = None
        disabled_existing = False
        existing: PluginRecord | None = None

        try:
            sha256, size = await self._save_upload(file, zip_path, max_bytes=self.settings.plugin.package_max_zip_bytes)
            if checksum and checksum.lower() != sha256:
                raise BadRequest(
                    message=_tp("PLUGIN_CHECKSUM_MISMATCH", "插件包校验失败"),
                    error="PLUGIN_CHECKSUM_MISMATCH",
                )

            manifest = self._validate_zip(zip_path)
            plugin_id = manifest.plugin.id
            slug = manifest.plugin.slug
            self._assert_safe_plugin_target_dir(plugin_id)

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

            # Installation is a high-impact admin action; serialize to avoid racy slug checks,
            # concurrent directory swaps, and inconsistent manager state.
            install_lock = _get_install_lock("__install__")
            async with install_lock:
                # Re-check slug conflicts inside lock (avoids racy installs of two plugins with the same slug).
                if self.manager is not None:
                    if not self.manager.descriptors:
                        self.manager.discover()
                    existing_owner = self.manager.slug_to_id.get(slug)
                    if existing_owner and existing_owner != plugin_id:
                        raise BadRequest(
                            message=_tp("PLUGIN_SLUG_CONFLICT", "插件 slug 冲突"),
                            error="PLUGIN_SLUG_CONFLICT",
                            details=f"slug={slug} conflicts with {existing_owner}",
                        )

                existing = await self.repo.get_plugin(plugin_id)
                was_started = bool(existing and existing.status == PluginStatus.STARTED and self.manager is not None)

                target_dir = self.root_dir / plugin_id

                # Only stop a running plugin after we've fully validated/extracted the new package.
                # This avoids unnecessary downtime if validation fails.
                if was_started and self.manager is not None:
                    try:
                        await self.manager.disable(plugin_id)
                        disabled_existing = True
                    except Exception as exc:
                        raise BadRequest(
                            message=_tp("PLUGIN_INSTALL_FAILED", "插件包安装失败"),
                            error="PLUGIN_INSTALL_FAILED",
                            details=f"failed to stop running plugin: {exc}",
                        ) from exc

                # Swap plugin directory.
                try:
                    backup_dir = None
                    if target_dir.exists():
                        backup_dir = self._backup_plugin_dir(plugin_id, target_dir)
                    self.root_dir.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(payload_dir), str(target_dir))
                except Exception as exc:
                    # Restore previous version if we created a backup.
                    try:
                        if backup_dir and not target_dir.exists() and backup_dir.exists():
                            shutil.move(str(backup_dir), str(target_dir))
                    except Exception as restore_exc:
                        logger.warning(
                            "Plugin install rollback failed (restore backup)",
                            plugin_id=plugin_id,
                            error=str(restore_exc),
                        )
                    # Best-effort re-enable if we stopped it.
                    if disabled_existing and self.manager is not None:
                        try:
                            await self.manager.enable(plugin_id)
                        except Exception:
                            pass
                    raise BadRequest(
                        message=_tp("PLUGIN_INSTALL_FAILED", "插件包安装失败"),
                        error="PLUGIN_INSTALL_FAILED",
                        details=str(exc),
                    ) from exc

                config_schema = manifest.config_schema.model_dump() if manifest.config_schema else None
                permissions = [perm.model_dump() for perm in manifest.permissions]
                defaults = build_default_config(manifest)
                status = PluginStatus.INSTALLED if enable else PluginStatus.DISABLED

                # Update DB record. If this fails, rollback filesystem swap.
                try:
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
                            package_filename=filename,
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
                            package_filename=filename,
                            package_checksum=sha256,
                            package_size=size,
                        )
                except Exception as exc:
                    # Remove newly installed version.
                    try:
                        if target_dir.exists():
                            shutil.rmtree(target_dir, ignore_errors=True)
                    except Exception:
                        pass
                    # Restore previous version if we created a backup.
                    try:
                        if backup_dir and not target_dir.exists() and backup_dir.exists():
                            shutil.move(str(backup_dir), str(target_dir))
                    except Exception as restore_exc:
                        logger.warning(
                            "Plugin install rollback failed (restore backup after DB error)",
                            plugin_id=plugin_id,
                            error=str(restore_exc),
                        )
                    # Best-effort re-enable if we stopped it.
                    if disabled_existing and self.manager is not None:
                        try:
                            await self.manager.enable(plugin_id)
                        except Exception:
                            pass
                    raise BadRequest(
                        message=_tp("PLUGIN_INSTALL_FAILED", "插件包安装失败"),
                        error="PLUGIN_INSTALL_FAILED",
                        details=str(exc),
                    ) from exc

                requires_restart = True

                # Best-effort: seed admin menu entries declared by the plugin manifest.
                try:
                    seeds = list(getattr(manifest, "admin_menu", None) or [])
                    if seeds:
                        await AdminMenuSeedService(self.settings).ensure_seeds(
                            owner_plugin_id=plugin_id,
                            seeds=seeds,
                            update_existing=False,
                            restore_deleted=True,
                        )
                except Exception as exc:
                    logger.warning("Plugin admin menu seed failed", plugin_id=plugin_id, error=str(exc))

                await self._request_restart(plugin_id, reason="install")
                # Fire an event so other parts (e.g. UI/menu/diagnostics) can react without hard coupling.
                try:
                    if self.manager is not None:
                        await self.manager.host.event_bus.publish(
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
        finally:
            shutil.rmtree(staging_dir, ignore_errors=True)

    async def validate_upload_to_staging(
        self,
        *,
        file: UploadFile,
        checksum: str | None,
        ttl_seconds: int = 10 * 60,
    ) -> tuple[str, str, int, PluginManifest]:
        """
        Upload and validate a plugin zip into a short-lived staging area.

        Returns: (token, sha256, size_bytes, manifest)
        """

        if not file.filename:
            raise BadRequest(message=_tp("PLUGIN_PACKAGE_REQUIRED", "缺少插件包文件"), error="PLUGIN_PACKAGE_REQUIRED")
        raw_filename = file.filename
        filename = self._sanitize_upload_filename(raw_filename)
        if not filename.endswith(".zip"):
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包必须为 zip 格式"),
                error="PLUGIN_PACKAGE_INVALID",
            )

        token = uuid7().hex
        staging_dir = self.root_dir / ".staging" / "validate" / token
        staging_dir.mkdir(parents=True, exist_ok=True)
        zip_path = staging_dir / filename

        sha256, size = await self._save_upload(file, zip_path, max_bytes=self.settings.plugin.package_max_zip_bytes)
        if checksum and checksum.lower() != sha256:
            raise BadRequest(
                message=_tp("PLUGIN_CHECKSUM_MISMATCH", "插件包校验失败"),
                error="PLUGIN_CHECKSUM_MISMATCH",
            )

        manifest = self._validate_zip(zip_path)
        self._assert_safe_plugin_target_dir(manifest.plugin.id)

        # Validate the package contains the entry root directory (same rule as install).
        entry_root = self._get_entry_root(manifest)
        try:
            with zipfile.ZipFile(zip_path) as zf:
                names = [n.replace("\\", "/") for n in zf.namelist() if n]
        except zipfile.BadZipFile as exc:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包必须为 zip 格式"),
                error="PLUGIN_PACKAGE_INVALID",
                details=str(exc),
            ) from exc

        has_entry = any(n.startswith(f"{entry_root}/") for n in names) or any(
            n.startswith(f"src/{entry_root}/") for n in names
        )
        if not has_entry:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_MISSING", "插件包缺少主包目录"),
                error="PLUGIN_PACKAGE_MISSING",
            )

        # Early detect slug conflicts to avoid a "validate ok -> install fail" UX.
        if self.manager is not None:
            if not self.manager.descriptors:
                self.manager.discover()
            slug = manifest.plugin.slug
            owner = self.manager.slug_to_id.get(slug)
            if owner and owner != manifest.plugin.id:
                raise BadRequest(
                    message=_tp("PLUGIN_SLUG_CONFLICT", "插件 slug 冲突"),
                    error="PLUGIN_SLUG_CONFLICT",
                    details={"slug": slug, "conflicts_with": owner},
                )

        meta = {
            "token": token,
            "filename": filename,
            "sha256": sha256,
            "size": int(size),
            "created_at": int(time.time()),
            "ttl_seconds": int(ttl_seconds),
        }
        try:
            (staging_dir / "validate.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        except Exception:
            # Best-effort: validation result can still be used.
            pass

        return token, sha256, int(size), manifest

    async def install_from_staging_token(
        self,
        *,
        token: str,
        enable: bool,
    ) -> tuple[PluginRecord, bool]:
        """
        Install a previously validated plugin package by token.

        Notes:
        - This does NOT re-upload from the client; it reads the staged zip from disk.
        - The staged zip is re-validated by the standard install flow.
        """

        raw = (token or "").strip().lower()
        if not raw or any(c not in "0123456789abcdef" for c in raw):
            raise BadRequest(
                message=_tp("PLUGIN_VALIDATE_TOKEN_INVALID", "校验令牌无效"),
                error="PLUGIN_VALIDATE_TOKEN_INVALID",
            )

        staging_dir = self.root_dir / ".staging" / "validate" / raw
        if not staging_dir.is_dir():
            raise BadRequest(
                message=_tp("PLUGIN_VALIDATE_TOKEN_INVALID", "校验令牌无效"),
                error="PLUGIN_VALIDATE_TOKEN_INVALID",
            )

        meta_path = staging_dir / "validate.json"
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
        except Exception:
            meta = {}

        created_at = int(meta.get("created_at") or 0) if isinstance(meta, dict) else 0
        ttl = int(meta.get("ttl_seconds") or 0) if isinstance(meta, dict) else 0
        if created_at and ttl and int(time.time()) > created_at + ttl:
            shutil.rmtree(staging_dir, ignore_errors=True)
            raise BadRequest(
                message=_tp("PLUGIN_VALIDATE_TOKEN_EXPIRED", "校验令牌已过期"),
                error="PLUGIN_VALIDATE_TOKEN_EXPIRED",
            )

        filename = str(meta.get("filename") or "") if isinstance(meta, dict) else ""
        sha256 = str(meta.get("sha256") or "") if isinstance(meta, dict) else ""

        zips = sorted(staging_dir.glob("*.zip"))
        zip_path = zips[0] if zips else None
        if zip_path is None or not zip_path.is_file():
            raise BadRequest(
                message=_tp("PLUGIN_VALIDATE_TOKEN_INVALID", "校验令牌无效"),
                error="PLUGIN_VALIDATE_TOKEN_INVALID",
            )

        class _PathUpload:
            filename: str | None

            def __init__(self, path: Path, *, filename_override: str | None) -> None:
                self.filename = filename_override or path.name
                self._path = path
                self._handle = path.open("rb")

            async def read(self, size: int = -1) -> bytes:
                return await asyncio.to_thread(self._handle.read, size)

            async def close(self) -> None:
                await asyncio.to_thread(self._handle.close)

        upload = _PathUpload(zip_path, filename_override=filename if filename else None)
        try:
            return await self.install_plugin(file=upload, checksum=sha256 or None, enable=enable)
        finally:
            shutil.rmtree(staging_dir, ignore_errors=True)

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
        except Exception as exc:
            logger.warning("Plugin admin menu seed failed on enable", plugin_id=plugin_id, error=str(exc))
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

    async def _save_upload(self, file: _UploadLike, dest: Path, *, max_bytes: int | None = None) -> tuple[str, int]:
        digest = hashlib.sha256()
        size = 0
        # Always close the UploadFile even if we fail part-way through.
        try:
            with dest.open("wb") as handle:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
                    if max_bytes is not None and max_bytes > 0 and size > max_bytes:
                        raise BadRequest(
                            message=_tp("PLUGIN_PACKAGE_TOO_LARGE", "插件包过大"),
                            error="PLUGIN_PACKAGE_TOO_LARGE",
                            details={"max_bytes": int(max_bytes), "size": int(size)},
                        )
        finally:
            await file.close()
        return digest.hexdigest(), size

    def _validate_zip(self, zip_path: Path) -> PluginManifest:
        try:
            with zipfile.ZipFile(zip_path) as zf:
                names = zf.namelist()
                if "plugin.toml" not in names:
                    raise BadRequest(
                        message=_tp("PLUGIN_TOML_MISSING", "插件包缺少 plugin.toml"),
                        error="PLUGIN_TOML_MISSING",
                    )

                try:
                    manifest = self._load_manifest_from_zip(zf)
                    self._validate_manifest(manifest)
                    return manifest
                except BadRequest:
                    raise
                except ValidationError as exc:
                    error = "PLUGIN_MANIFEST_INVALID"
                    default = "插件清单不合法"
                    # Provide stable error codes for common manifest failures.
                    for err in exc.errors():
                        loc = tuple(err.get("loc") or ())
                        msg = str(err.get("msg") or "")
                        if loc[:2] == ("plugin", "id"):
                            if "PLUGIN_ID_RESERVED" in msg:
                                error = "PLUGIN_ID_RESERVED"
                                default = "插件 ID 被保留"
                            else:
                                error = "PLUGIN_ID_INVALID"
                                default = "插件 ID 不合法"
                            break
                    raise BadRequest(
                        message=_tp(error, default), error=error, details={"errors": exc.errors()}
                    ) from exc
                except (tomllib.TOMLDecodeError, UnicodeDecodeError, OSError) as exc:
                    raise BadRequest(
                        message=_tp("PLUGIN_MANIFEST_INVALID", "插件清单不合法"),
                        error="PLUGIN_MANIFEST_INVALID",
                        details=str(exc),
                    ) from exc
        except zipfile.BadZipFile as exc:
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包必须为 zip 格式"),
                error="PLUGIN_PACKAGE_INVALID",
                details=str(exc),
            ) from exc

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
        max_files = int(getattr(self.settings.plugin, "package_max_files", 0) or 0)
        max_total = int(getattr(self.settings.plugin, "package_max_total_uncompressed_bytes", 0) or 0)
        max_single = int(getattr(self.settings.plugin, "package_max_single_file_bytes", 0) or 0)

        target_resolved = target.resolve()
        total_uncompressed = 0
        file_count = 0
        total_written = 0

        def _is_relative_to(path: Path, base: Path) -> bool:
            try:
                return path.is_relative_to(base)
            except AttributeError:
                return str(path).startswith(str(base))

        def _is_symlink(info: zipfile.ZipInfo) -> bool:
            # ZipInfo.external_attr carries the unix mode in the upper 16 bits when present.
            mode = (info.external_attr >> 16) & 0o170000
            return mode == stat.S_IFLNK

        for member in zf.infolist():
            raw_name = member.filename
            name = raw_name.replace("\\", "/")
            if not name:
                continue
            if name.startswith("/"):
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
            if not _is_relative_to(resolved, target_resolved):
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_INVALID", "插件包路径非法"),
                    error="PLUGIN_PACKAGE_INVALID",
                )

            if member.is_dir():
                resolved.mkdir(parents=True, exist_ok=True)
                continue

            if _is_symlink(member):
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_HAS_SYMLINK", "插件包包含不安全的符号链接"),
                    error="PLUGIN_PACKAGE_HAS_SYMLINK",
                )

            file_count += 1
            if max_files and file_count > max_files:
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_TOO_MANY_FILES", "插件包文件过多"),
                    error="PLUGIN_PACKAGE_TOO_MANY_FILES",
                    details={"max_files": max_files, "files": file_count},
                )

            file_size = int(getattr(member, "file_size", 0) or 0)
            if max_single and file_size > max_single:
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_FILE_TOO_LARGE", "插件包文件过大"),
                    error="PLUGIN_PACKAGE_FILE_TOO_LARGE",
                    details={"max_bytes": max_single, "size": file_size, "path": raw_name},
                )

            total_uncompressed += file_size
            if max_total and total_uncompressed > max_total:
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_UNCOMPRESSED_TOO_LARGE", "插件包解压后体积过大"),
                    error="PLUGIN_PACKAGE_UNCOMPRESSED_TOO_LARGE",
                    details={"max_bytes": max_total, "size": total_uncompressed},
                )

            resolved.parent.mkdir(parents=True, exist_ok=True)
            written = 0
            with zf.open(member, "r") as src, resolved.open("wb") as dst:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
                    written += len(chunk)
                    total_written += len(chunk)
                    # Enforce limits on actual written bytes too (defense in depth against malformed zip metadata).
                    if max_single and written > max_single:
                        raise BadRequest(
                            message=_tp("PLUGIN_PACKAGE_FILE_TOO_LARGE", "插件包文件过大"),
                            error="PLUGIN_PACKAGE_FILE_TOO_LARGE",
                            details={"max_bytes": max_single, "size": written, "path": raw_name},
                        )
                    if max_total and total_written > max_total:
                        raise BadRequest(
                            message=_tp("PLUGIN_PACKAGE_UNCOMPRESSED_TOO_LARGE", "插件包解压后体积过大"),
                            error="PLUGIN_PACKAGE_UNCOMPRESSED_TOO_LARGE",
                            details={"max_bytes": max_total, "size": total_written},
                        )

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

    def validate_config_payload(self, schema: ConfigSchema, config: dict[str, Any]) -> None:
        """
        Validate a config payload against a plugin config schema.

        Notes:
        - This is a public API for other modules (e.g. workspace plugin center).
        - It preserves the same validation rules as global plugin config updates.
        """

        self._validate_config(schema, config)

    def _assert_safe_plugin_target_dir(self, plugin_id: str) -> None:
        """
        Second safety gate: ensure the plugin installation target directory is inside PLUGIN__ROOT_DIR.
        """

        root = self.root_dir.resolve()
        target = (self.root_dir / str(plugin_id)).resolve()
        try:
            if not target.is_relative_to(root):
                raise BadRequest(
                    message=_tp("PLUGIN_ID_INVALID", "插件 ID 不合法"),
                    error="PLUGIN_ID_INVALID",
                )
        except AttributeError:
            # Python < 3.9 compatibility (should not happen in this repo, but keep defensive).
            if not str(target).startswith(str(root)):
                raise BadRequest(
                    message=_tp("PLUGIN_ID_INVALID", "插件 ID 不合法"),
                    error="PLUGIN_ID_INVALID",
                )


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
