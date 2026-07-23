from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.models.system.plugin_installation import (
    PluginLifecycleState,
    PluginRuntimeActivationState,
    PluginSourceType,
)
from src.modules.system.plugins.schema import SystemPluginCatalogItemOut


def build_plugin_installation_data(
    item: SystemPluginCatalogItemOut,
    *,
    actor_user_id: UUID,
) -> dict[str, object]:
    now = datetime.now(UTC)
    is_installed = item.installed_version is not None
    capabilities = sorted({
        *item.provides.services,
        *item.provides.providers,
        *item.provides.connectors,
        *item.provides.middlewares,
        *item.provides.content_types,
    })
    return {
        "plugin_name": item.name,
        "source_type": PluginSourceType(item.source_type),
        "source_locator": item.source_locator,
        "installed_version": item.installed_version,
        "available_version": item.available_version,
        "package_checksum": item.package_checksum,
        "manifest_digest": item.manifest_digest,
        "provenance_status": str(item.provenance_status),
        "compatibility": item.compatibility.model_dump(mode="json", by_alias=False),
        "lifecycle_state": PluginLifecycleState.INSTALLED if is_installed else PluginLifecycleState.DISABLED,
        "desired_enabled": is_installed,
        "runtime_activation_state": (
            PluginRuntimeActivationState.VERIFIED if is_installed else PluginRuntimeActivationState.NOT_REQUIRED
        ),
        "enabled_capabilities": capabilities if is_installed else [],
        "requested_permissions": item.permissions,
        "approved_permissions": item.permissions if is_installed else [],
        "installed_by_user_id": actor_user_id if is_installed else None,
        "updated_by_user_id": actor_user_id,
        "installed_at": now if is_installed else None,
        "runtime_verified_at": now if is_installed else None,
    }
