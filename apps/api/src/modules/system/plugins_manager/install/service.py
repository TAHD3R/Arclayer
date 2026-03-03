from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.modules.system.plugins_manager.install.archive.service import PluginInstallArchiveMixin
from apps.api.src.modules.system.plugins_manager.install.files.service import PluginInstallFilesMixin, UploadLike
from apps.api.src.modules.system.plugins_manager.install.filesystem.service import PluginInstallFilesystemMixin
from apps.api.src.modules.system.plugins_manager.install.restart.service import PluginInstallRestartMixin
from apps.api.src.modules.system.plugins_manager.install.staging.service import PluginInstallStagingMixin
from apps.api.src.modules.system.plugins_manager.install.workflow.service import PluginInstallWorkflowMixin
from apps.api.src.modules.system.plugins_manager.repository import PluginRepository
from apps.api.src.plugin.manager import PluginManager


class PluginInstallService(
    PluginInstallFilesMixin,
    PluginInstallArchiveMixin,
    PluginInstallFilesystemMixin,
    PluginInstallRestartMixin,
    PluginInstallStagingMixin,
    PluginInstallWorkflowMixin,
    BaseService,
):
    def __init__(
        self,
        settings: Settings,
        *,
        repo: PluginRepository,
        manager: PluginManager | None,
        root_dir: Path,
        merge_config: Callable[[dict[str, object], dict[str, object]], dict[str, object]],
    ) -> None:
        super().__init__(settings)
        self.repo = repo
        self.manager = manager
        self.root_dir = root_dir
        self._merge_config = merge_config


__all__ = ["PluginInstallService", "UploadLike"]
