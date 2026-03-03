from __future__ import annotations

from apps.api.src.modules.system.plugins.manager.install.shared.service import LIFECYCLE_RECOVERY_ERRORS, logger
from apps.api.src.plugin.manager import PluginManager


class PluginInstallRestartMixin:
    manager: PluginManager | None

    async def _reenable_plugin_after_failure(self, *, plugin_id: str, action: str) -> None:
        if self.manager is None:
            return
        try:
            await self.manager.enable(plugin_id)
        except LIFECYCLE_RECOVERY_ERRORS as exc:
            logger.warning(
                "Plugin re-enable failed after rollback",
                plugin_id=plugin_id,
                action=action,
                error=str(exc),
            )

    async def _request_restart(self, plugin_id: str, *, reason: str) -> None:
        if self.manager is None:
            return
        await self.manager.request_restart(plugin_id, reason=reason)
