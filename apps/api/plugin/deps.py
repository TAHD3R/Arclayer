from __future__ import annotations

from apps.api.core.exceptions import Forbidden
from apps.api.core.i18n import t
from apps.api.modules.system.models.plugin import PluginRecord
from apps.api.plugin.types import PluginStatus


def require_plugin_enabled(plugin_id: str):
    async def _dependency() -> None:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None or record.status != PluginStatus.STARTED:
            raise Forbidden(
                message=t("plugin", "PLUGIN_DISABLED", default="插件未启用"),
                error="PLUGIN_DISABLED",
            )

    return _dependency
