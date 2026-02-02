from __future__ import annotations

from fastapi import APIRouter

from apps.api.config import Settings
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.routes import register_plugin_routers
from apps.api.routers.v1.me import router as me_router
from apps.api.routers.v1.public import router as public_router
from apps.api.routers.v1.sites.router import router as sites_router
from apps.api.routers.v1.system import router as system_router
from apps.api.routers.v1.workspaces.router import router as workspaces_router


def build_v1_router(settings: Settings, *, plugin_manager: PluginManager) -> APIRouter:
    api_prefix = settings.application.api_prefix.rstrip("/")
    version_prefix = settings.application.api_version_prefix
    if not version_prefix.startswith("/"):
        version_prefix = f"/{version_prefix}"

    root = APIRouter(prefix=f"{api_prefix}{version_prefix}")
    root.include_router(public_router)
    root.include_router(sites_router)
    root.include_router(system_router, prefix="/system")
    root.include_router(me_router)
    # Workspace-scoped admin governance (v2).
    root.include_router(workspaces_router)
    register_plugin_routers(root, plugin_manager=plugin_manager)
    return root
