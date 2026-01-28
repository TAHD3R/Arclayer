from __future__ import annotations

from fastapi import FastAPI

from apps.api.config import Settings
from apps.api.plugin.manager import PluginManager
from apps.api.routers.assets import router as assets_router
from apps.api.routers.library import router as library_router
from apps.api.routers.shares import router as shares_router
from apps.api.routers.v1 import build_v1_router


def register_routes(app: FastAPI, settings: Settings, *, plugin_manager: PluginManager) -> None:
    # Public, non-versioned asset delivery (Range-supported).
    app.include_router(assets_router)
    # Public, non-versioned share links (Range-supported).
    app.include_router(shares_router)
    # Public, non-versioned public library entry (HTML + JSON).
    app.include_router(library_router)

    v1_router = build_v1_router(settings, plugin_manager=plugin_manager)
    app.include_router(v1_router)
