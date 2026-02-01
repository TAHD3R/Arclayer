from __future__ import annotations

from apps.api.config import Settings
from apps.api.core.rbac.constants import CORE_PERMISSION_OWNER
from apps.api.core.rbac.permissions import CORE_PERMISSION_TEMPLATES
from apps.api.core.rbac.service import RBACService
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.registry import registry


def register_permission_templates(*, plugin_manager: PluginManager) -> None:
    """
    Register permission templates for both core and plugins into the in-memory registry.
    """

    registry.register_permissions(CORE_PERMISSION_OWNER, CORE_PERMISSION_TEMPLATES)
    for desc in plugin_manager.descriptors.values():
        registry.register_permissions(desc.plugin_id, desc.manifest.permissions)


async def ensure_rbac_ready(*, settings: Settings) -> None:
    """
    Ensure roles + permissions are consistent in DB.

    This should be called after DB is initialized.
    """

    service = RBACService(settings)
    await service.ensure_system_roles()
    await service.sync_permissions()
