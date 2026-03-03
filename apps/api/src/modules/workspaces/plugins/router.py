from __future__ import annotations

from fastapi import APIRouter

from apps.api.src.modules.workspaces.plugins.center.router import router as plugins_center_router

router = APIRouter()
router.include_router(plugins_center_router)
