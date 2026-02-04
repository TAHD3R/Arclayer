from __future__ import annotations

from apps.api.core.exceptions import Forbidden
from apps.api.core.i18n import t
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.modules.workspaces.context import get_current_workspace_id
from apps.api.plugin.types import PluginStatus


def require_plugin_enabled(plugin_id: str):
    async def _dependency() -> None:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None or record.status != PluginStatus.STARTED:
            raise Forbidden(
                message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                error="PLUGIN_DISABLED",
            )

        # If request has a workspace context, also enforce workspace-level toggle.
        workspace_id = get_current_workspace_id()
        if workspace_id is None:
            return
        try:
            from apps.api.modules.workspaces.plugins_center.models import WorkspacePluginState

            state = await WorkspacePluginState.get_or_none(workspace_id=workspace_id, plugin_id=plugin_id)
            if state is None or not bool(state.enabled):
                raise Forbidden(
                    message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                    error="PLUGIN_DISABLED",
                )
        except Forbidden:
            raise
        except Exception:
            # Fail closed: if state can't be loaded, block plugin routes for safety.
            raise Forbidden(
                message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                error="PLUGIN_DISABLED",
            )

    return _dependency
