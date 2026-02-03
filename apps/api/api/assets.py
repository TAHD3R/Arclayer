from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.assets.router import router as assets_router

router = APIRouter()
router.include_router(assets_router)
