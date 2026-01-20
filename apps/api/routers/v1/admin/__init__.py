from __future__ import annotations

from fastapi import APIRouter

from apps.api.routers.v1.admin.plugins import router as plugins_router

router = APIRouter()

router.include_router(plugins_router, prefix="/plugins")
