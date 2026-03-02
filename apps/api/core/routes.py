from __future__ import annotations

from fastapi import FastAPI

from apps.api.config import Settings
from apps.api.modules.api_aggregation.router import build_root_router
from apps.api.modules.api_aggregation.v1.router import build_v1_router
from apps.api.plugin.manager import PluginManager


def register_routes(app: FastAPI, settings: Settings, *, plugin_manager: PluginManager) -> None:
    root_router = build_root_router()
    app.include_router(root_router)

    v1_router = build_v1_router(settings, plugin_manager=plugin_manager)
    app.include_router(v1_router)
