from __future__ import annotations

from apps.api.src.config import Settings
from apps.api.src.modules.system.rbac.service import RBACService
from apps.api.src.plugin.manager import PluginManager


async def ensure_rbac_ready(*, settings: Settings, plugin_manager: PluginManager) -> None:
    """
    Ensure roles + permissions are consistent in DB.

    Notes:
    - This should be called after DB is initialized.
    - Permission templates are collected from both core and plugin manifests.
    """

    service = RBACService(settings, plugin_manager=plugin_manager)
    await service.sync_permission_catalog()
    await service.ensure_all_workspaces_ready()
