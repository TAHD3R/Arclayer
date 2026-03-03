from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

from apps.api.src.common.utils.ids import uuid7
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest
from apps.api.src.modules.system.admin.menus.seeds.service import AdminMenuSeedService
from apps.api.src.modules.system.models.plugin import PluginRecord
from apps.api.src.modules.system.plugins_manager.install.files.service import UploadLike
from apps.api.src.modules.system.plugins_manager.install.shared.service import (
    EVENT_PUBLISH_ERRORS,
    LIFECYCLE_RECOVERY_ERRORS,
    MENU_SEED_ERRORS,
    PERSISTENCE_ERRORS,
    _tp,
    get_install_lock,
    logger,
)
from apps.api.src.modules.system.plugins_manager.repository import PluginRepository
from apps.api.src.plugin.event_bus import Event
from apps.api.src.plugin.events import PLUGIN_INSTALLED
from apps.api.src.plugin.manager import PluginManager
from apps.api.src.plugin.manifest import PluginManifest, build_default_config
from apps.api.src.plugin.types import PluginStatus


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
                        backup_dir = self._backup_plugin_dir(plugin_id, target_dir)
                    self.root_dir.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(payload_dir), str(target_dir))
                except (OSError, shutil.Error) as exc:
                    self._restore_backup_dir(
                        plugin_id=plugin_id,
                        target_dir=target_dir,
                        backup_dir=backup_dir,
                        action="install_rollback_restore_backup",
                    )
                    if disabled_existing:
                        await self._reenable_plugin_after_failure(
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
                except PERSISTENCE_ERRORS as exc:
                    self._cleanup_target_dir(
                        plugin_id=plugin_id,
                        target_dir=target_dir,
                        action="install_db_error_cleanup_target_dir",
                    )
                    self._restore_backup_dir(
                        plugin_id=plugin_id,
                        target_dir=target_dir,
                        backup_dir=backup_dir,
                        action="install_db_error_restore_backup",
                    )
                    if disabled_existing:
                        await self._reenable_plugin_after_failure(
                            plugin_id=plugin_id,
                            action="install_db_error_reenable",
                        )
                    raise BadRequest(
                        message=_tp("PLUGIN_INSTALL_FAILED", "插件包安装失败"),
                        error="PLUGIN_INSTALL_FAILED",
                        details=str(exc),
                    ) from exc

                requires_restart = True

                try:
                    seeds = list(getattr(manifest, "admin_menu", None) or [])
                    if seeds:
                        await AdminMenuSeedService(self.settings).ensure_seeds(
                            owner_plugin_id=plugin_id,
                            seeds=seeds,
                            update_existing=False,
                            restore_deleted=True,
                        )
                except MENU_SEED_ERRORS as exc:
                    logger.warning(
                        "Plugin admin menu seed failed",
                        plugin_id=plugin_id,
                        action="install_seed_admin_menu",
                        error=str(exc),
                    )

                await self._request_restart(plugin_id, reason="install")
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
