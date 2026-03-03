from __future__ import annotations

from fastapi import APIRouter

from apps.api.src.config import Settings
from apps.api.src.plugin.manager import PluginManager


def build_v1_router(settings: Settings, *, plugin_manager: PluginManager) -> APIRouter:
    # Import routers lazily to avoid circular imports during app startup and tests.
    from apps.api.src.modules.auth.router import router as auth_router
    from apps.api.src.modules.organization.router import router as organization_router
    from apps.api.src.modules.provision.router import router as provision_router
    from apps.api.src.modules.sites.delivery.router import router as delivery_router
    from apps.api.src.modules.sites.patterns.router import router as patterns_router
    from apps.api.src.modules.sites.public.router import router as sites_public_router
    from apps.api.src.modules.sites.router import router as sites_router
    from apps.api.src.modules.sys.router import router as sys_router
    from apps.api.src.modules.system.router import router as system_router
    from apps.api.src.modules.workspaces.router import router as workspaces_router
    from apps.api.src.plugin.routes import register_plugin_routers

    api_prefix = settings.application.api_prefix.rstrip("/")
    version_prefix = settings.application.api_version_prefix
    if not version_prefix.startswith("/"):
        version_prefix = f"/{version_prefix}"

    root = APIRouter(prefix=f"{api_prefix}{version_prefix}")
    root.include_router(auth_router, prefix="/auth")
    root.include_router(sites_router)
    root.include_router(delivery_router)
    root.include_router(patterns_router)
    root.include_router(sites_public_router)
    root.include_router(sys_router, prefix="/sys")
    root.include_router(system_router, prefix="/system")
    root.include_router(organization_router)
    root.include_router(provision_router)
    # Workspace-scoped admin governance (v2).
    root.include_router(workspaces_router)
    register_plugin_routers(root, plugin_manager=plugin_manager)
    return root
