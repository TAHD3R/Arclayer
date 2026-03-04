from __future__ import annotations

import shutil
import zipfile
from pathlib import Path
from typing import Protocol, cast

from apps.api.src.common.utils.ids import uuid7
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest
from apps.api.src.models.system.plugin import PluginRecord
from apps.api.src.modules.system.plugins.manager.install.files.service import UploadLike
from apps.api.src.modules.system.plugins.manager.install.shared.service import (
    EVENT_PUBLISH_ERRORS,
    LIFECYCLE_RECOVERY_ERRORS,
    PERSISTENCE_ERRORS,
    _tp,
    get_install_lock,
    logger,
)
from apps.api.src.modules.system.plugins.manager.repository import PluginRepository
from apps.api.src.plugin.event_bus import Event
from apps.api.src.plugin.events import PLUGIN_INSTALLED
from apps.api.src.plugin.manager import PluginManager
from apps.api.src.plugin.manifest import PluginManifest, build_default_config
from apps.api.src.plugin.types import PluginStatus


class _PluginInstallWorkflowDeps(Protocol):
    settings: Settings

    def _sanitize_upload_filename(self, filename: str) -> str: ...

    async def _save_upload(self, file: UploadLike, dest: Path, *, max_bytes: int) -> tuple[str, int]: ...

    def _validate_zip(self, zip_path: Path) -> PluginManifest: ...

    def _assert_safe_plugin_target_dir(self, plugin_id: str) -> None: ...

    def _safe_extract(self, zf: zipfile.ZipFile, target: Path) -> None: ...

    def _get_entry_root(self, manifest: PluginManifest) -> str: ...

    def _backup_plugin_dir(self, plugin_id: str, target_dir: Path) -> Path: ...

    def _restore_backup_dir(
        self,
        *,
        plugin_id: str,
        target_dir: Path,
        backup_dir: Path | None,
        action: str,
    ) -> None: ...

    async def _reenable_plugin_after_failure(self, *, plugin_id: str, action: str) -> None: ...

    def _cleanup_target_dir(self, *, plugin_id: str, target_dir: Path, action: str) -> None: ...

    def _merge_config(self, current: dict[str, object], updates: dict[str, object]) -> dict[str, object]: ...

    async def _request_restart(self, plugin_id: str, *, reason: str) -> None: ...


class PluginInstallWorkflowMixin:
    settings: Settings
    repo: PluginRepository
    manager: PluginManager | None
    root_dir: Path

    async def install_plugin(
        self,
        *,
        file: UploadLike,
        checksum: str | None,
        enable: bool,
    ) -> tuple[PluginRecord, bool]:
        svc = cast(_PluginInstallWorkflowDeps, self)
        if not file.filename:
            raise BadRequest(message=_tp("PLUGIN_PACKAGE_REQUIRED", "缺少插件包文件"), error="PLUGIN_PACKAGE_REQUIRED")
        raw_filename = file.filename
        filename = svc._sanitize_upload_filename(raw_filename)
        if not filename.endswith(".zip"):
            raise BadRequest(
                message=_tp("PLUGIN_PACKAGE_INVALID", "插件包必须为 zip 格式"),
                error="PLUGIN_PACKAGE_INVALID",
            )

        staging_dir = self.root_dir / ".staging" / uuid7().hex
        staging_dir.mkdir(parents=True, exist_ok=True)
        zip_path = staging_dir / filename

        manifest: PluginManifest
        plugin_id: str | None = None
        slug: str | None = None
        sha256: str | None = None
        size: int | None = None
        target_dir: Path | None = None
        backup_dir: Path | None = None
        disabled_existing = False
        existing: PluginRecord | None = None

        try:
            sha256, size = await svc._save_upload(file, zip_path, max_bytes=svc.settings.plugin.package_max_zip_bytes)
            if checksum and checksum.lower() != sha256:
                raise BadRequest(
                    message=_tp("PLUGIN_CHECKSUM_MISMATCH", "插件包校验失败"),
                    error="PLUGIN_CHECKSUM_MISMATCH",
                )

            manifest = svc._validate_zip(zip_path)
            plugin_id = manifest.plugin.id
            slug = manifest.plugin.slug
            svc._assert_safe_plugin_target_dir(plugin_id)

            payload_dir = staging_dir / "payload"
            payload_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(zip_path) as zf:
                svc._safe_extract(zf, payload_dir)

            if not (payload_dir / "plugin.toml").is_file():
                raise BadRequest(
                    message=_tp("PLUGIN_TOML_MISSING", "插件包缺少 plugin.toml"),
                    error="PLUGIN_TOML_MISSING",
                )
            entry_root = svc._get_entry_root(manifest)
            if not (payload_dir / entry_root).is_dir() and not (payload_dir / "src" / entry_root).is_dir():
                raise BadRequest(
                    message=_tp("PLUGIN_PACKAGE_MISSING", "插件包缺少主包目录"),
                    error="PLUGIN_PACKAGE_MISSING",
                )

            install_lock = get_install_lock("__install__")
            async with install_lock:
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

                if was_started and self.manager is not None:
                    try:
                        await self.manager.disable(plugin_id)
                        disabled_existing = True
                    except LIFECYCLE_RECOVERY_ERRORS as exc:
                        raise BadRequest(
                            message=_tp("PLUGIN_INSTALL_FAILED", "插件包安装失败"),
                            error="PLUGIN_INSTALL_FAILED",
                            details=f"failed to stop running plugin: {exc}",
                        ) from exc

                try:
                    backup_dir = None
                    if target_dir.exists():
                        backup_dir = svc._backup_plugin_dir(plugin_id, target_dir)
                    self.root_dir.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(payload_dir), str(target_dir))
                except (OSError, shutil.Error) as exc:
                    svc._restore_backup_dir(
                        plugin_id=plugin_id,
                        target_dir=target_dir,
                        backup_dir=backup_dir,
                        action="install_rollback_restore_backup",
                    )
                    if disabled_existing:
                        await svc._reenable_plugin_after_failure(
                            plugin_id=plugin_id,
                            action="install_rollback_reenable",
                        )
                    raise BadRequest(
                        message=_tp("PLUGIN_INSTALL_FAILED", "插件包安装失败"),
                        error="PLUGIN_INSTALL_FAILED",
                        details=str(exc),
                    ) from exc

                config_schema = manifest.config_schema.model_dump() if manifest.config_schema else None
                permissions = [perm.model_dump() for perm in manifest.permissions]
                defaults = build_default_config(manifest)
                status = PluginStatus.INSTALLED if enable else PluginStatus.DISABLED

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
                        config = svc._merge_config(existing.config or {}, defaults)
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
                except PERSISTENCE_ERRORS as exc:
                    svc._cleanup_target_dir(
                        plugin_id=plugin_id,
                        target_dir=target_dir,
                        action="install_db_error_cleanup_target_dir",
                    )
                    svc._restore_backup_dir(
                        plugin_id=plugin_id,
                        target_dir=target_dir,
                        backup_dir=backup_dir,
                        action="install_db_error_restore_backup",
                    )
                    if disabled_existing:
                        await svc._reenable_plugin_after_failure(
                            plugin_id=plugin_id,
                            action="install_db_error_reenable",
                        )
                    raise BadRequest(
                        message=_tp("PLUGIN_INSTALL_FAILED", "插件包安装失败"),
                        error="PLUGIN_INSTALL_FAILED",
                        details=str(exc),
                    ) from exc

                requires_restart = True

                await svc._request_restart(plugin_id, reason="install")
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
                except EVENT_PUBLISH_ERRORS as exc:
                    logger.warning(
                        "Plugin installed event publish failed",
                        plugin_id=plugin_id,
                        slug=slug,
                        action="publish_plugin_installed_event",
                        error=str(exc),
                    )
                return record, requires_restart
        finally:
            shutil.rmtree(staging_dir, ignore_errors=True)
