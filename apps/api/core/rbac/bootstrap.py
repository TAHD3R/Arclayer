from __future__ import annotations

from uuid import UUID

from apps.api.config import Settings
from apps.api.core.authz import AUTHZ_EXTENSION_POINT, AUTHZ_SNAPSHOT_EXTENSION_POINT
from apps.api.core.rbac.constants import CORE_PERMISSION_OWNER
from apps.api.core.rbac.engine import RBACAuthorizationEngine
from apps.api.core.rbac.permissions import CORE_PERMISSION_TEMPLATES
from apps.api.core.rbac.service import RBACService
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.registry import registry


class RBACAuthzSnapshotProvider:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def get_snapshot(self, user_id: UUID):
        snap = await RBACService(self._settings).get_authz_snapshot(user_id=user_id)
        return snap.model_dump()


def register_core_authz_providers(settings: Settings) -> None:
    """
    Register core RBAC authz engine + snapshot provider into the global registry.

    Notes:
    - This is idempotent and safe to call multiple times.
    - It does not touch the database (DB work happens in `ensure_rbac_ready`).
    """

    if registry.get_extension(AUTHZ_EXTENSION_POINT) is None:
        registry.register_extension(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT, RBACAuthorizationEngine())
    if registry.get_extension(AUTHZ_SNAPSHOT_EXTENSION_POINT) is None:
        registry.register_extension(
            CORE_PERMISSION_OWNER,
            AUTHZ_SNAPSHOT_EXTENSION_POINT,
            RBACAuthzSnapshotProvider(settings),
        )


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
