from __future__ import annotations

from fastapi import HTTPException, status

from apps.api.models.plugin import PluginRecord
from apps.api.plugin.types import PluginStatus


def require_plugin_enabled(plugin_id: str):
    async def _dependency() -> None:
        record = await PluginRecord.get_or_none(plugin_id=plugin_id)
        if record is None or record.status != PluginStatus.STARTED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="插件未启用")

    return _dependency
