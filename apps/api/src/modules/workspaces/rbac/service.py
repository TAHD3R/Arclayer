from __future__ import annotations

from apps.api.src.config import Settings
from apps.api.src.modules.system.rbac.service import RBACService


class WorkspaceRBACService(RBACService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def _get_plugin_name_map(self, *, plugin_ids: set[str]) -> dict[str, str]:
        return {}

    async def get_plugin_name_map(self, *, plugin_ids: set[str]) -> dict[str, str]:
        return await self._get_plugin_name_map(plugin_ids=plugin_ids)
