from __future__ import annotations

from fastapi import FastAPI

from apps.api.src.config import Settings
from apps.api.src.modules.aggregation.router import build_root_router
from apps.api.src.modules.aggregation.v1.router import build_v1_router


def register_routes(app: FastAPI, settings: Settings) -> None:
    root_router = build_root_router()
    app.include_router(root_router)

    v1_router = build_v1_router(settings)
    app.include_router(v1_router)
