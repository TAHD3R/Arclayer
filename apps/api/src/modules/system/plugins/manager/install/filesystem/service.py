from __future__ import annotations

import shutil
from datetime import UTC, datetime
from pathlib import Path

from apps.api.src.core.exceptions import BadRequest
from apps.api.src.modules.system.plugins.manager.install.shared.service import _tp, logger


class PluginInstallFilesystemMixin:
    root_dir: Path

    def _backup_plugin_dir(self, plugin_id: str, target_dir: Path) -> Path:
        timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        backup_root = self.root_dir / ".backup" / plugin_id / timestamp
        backup_root.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(target_dir), str(backup_root))
        return backup_root

    def _cleanup_target_dir(self, *, plugin_id: str, target_dir: Path, action: str) -> None:
        try:
            if target_dir.exists():
                shutil.rmtree(target_dir, ignore_errors=True)
        except OSError as exc:
            logger.warning(
                "Plugin install cleanup failed",
                plugin_id=plugin_id,
                action=action,
                error=str(exc),
            )

    def _restore_backup_dir(
        self,
        *,
        plugin_id: str,
        target_dir: Path,
        backup_dir: Path | None,
        action: str,
    ) -> None:
        if backup_dir is None:
            return
        if target_dir.exists() or not backup_dir.exists():
            return
        try:
            shutil.move(str(backup_dir), str(target_dir))
        except (OSError, shutil.Error) as exc:
            logger.warning(
                "Plugin install rollback restore failed",
                plugin_id=plugin_id,
                action=action,
                error=str(exc),
            )

    def _assert_safe_plugin_target_dir(self, plugin_id: str) -> None:
        root = self.root_dir.resolve()
        target = (self.root_dir / str(plugin_id)).resolve()
        try:
            if not target.is_relative_to(root):
                raise BadRequest(message=_tp("PLUGIN_ID_INVALID", "插件 ID 不合法"), error="PLUGIN_ID_INVALID")
        except AttributeError:
            if not str(target).startswith(str(root)):
                raise BadRequest(message=_tp("PLUGIN_ID_INVALID", "插件 ID 不合法"), error="PLUGIN_ID_INVALID")
