from __future__ import annotations

from fastapi import APIRouter

from apps.api.src.modules.system.plugins.manager.router import router as plugin_manager_router

router = APIRouter()
router.include_router(plugin_manager_router)
