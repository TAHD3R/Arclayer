from __future__ import annotations

from src.config import Settings
from src.modules.system.rbac.service import RBACService


class WorkspaceRBACService(RBACService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def _get_owner_name_map(self, *, owner_keys: set[str]) -> dict[str, str]:
        return {}

    async def get_owner_name_map(self, *, owner_keys: set[str]) -> dict[str, str]:
        return await self._get_owner_name_map(owner_keys=owner_keys)
