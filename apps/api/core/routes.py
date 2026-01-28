from __future__ import annotations

from fastapi import FastAPI

from apps.api.config import Settings
from apps.api.plugin.manager import PluginManager
from apps.api.routers.assets import router as assets_router
from apps.api.routers.v1 import build_v1_router


def register_routes(app: FastAPI, settings: Settings, *, plugin_manager: PluginManager) -> None:
    # Public, non-versioned asset delivery (Range-supported).
    app.include_router(assets_router)

    v1_router = build_v1_router(settings, plugin_manager=plugin_manager)
    app.include_router(v1_router)
