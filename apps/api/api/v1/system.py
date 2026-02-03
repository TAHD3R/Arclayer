from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.system.router import router as system_router

router = APIRouter()
router.include_router(system_router, prefix="/system")
