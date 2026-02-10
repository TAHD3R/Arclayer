from __future__ import annotations

from fastapi import APIRouter

from apps.api.config import Settings
from apps.api.plugin.manager import PluginManager


def build_v1_router(settings: Settings, *, plugin_manager: PluginManager) -> APIRouter:
    # Import routers lazily to avoid circular imports during app startup and tests.
    from apps.api.api.v1.auth import router as auth_router
    from apps.api.api.v1.organization import router as organization_router
    from apps.api.api.v1.provision import router as provision_router
    from apps.api.api.v1.sites import router as sites_router
    from apps.api.api.v1.system import router as system_router
    from apps.api.api.v1.workspaces import router as workspaces_router
    from apps.api.plugin.routes import register_plugin_routers

    api_prefix = settings.application.api_prefix.rstrip("/")
    version_prefix = settings.application.api_version_prefix
    if not version_prefix.startswith("/"):
        version_prefix = f"/{version_prefix}"

    root = APIRouter(prefix=f"{api_prefix}{version_prefix}")
    root.include_router(auth_router)
    root.include_router(sites_router)
    root.include_router(system_router)
    root.include_router(organization_router)
    root.include_router(provision_router)
    # Workspace-scoped admin governance (v2).
    root.include_router(workspaces_router)
    register_plugin_routers(root, plugin_manager=plugin_manager)
    return root
