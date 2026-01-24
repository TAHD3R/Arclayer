from __future__ import annotations

from fastapi import APIRouter

from apps.api.routers.v1.admin.plugins import router as plugins_router
from apps.api.routers.v1.admin.ui.router import router as ui_router
from apps.api.routers.v1.admin.users import router as users_router

router = APIRouter()

router.include_router(plugins_router, prefix="/plugins")
router.include_router(users_router, prefix="/users")
router.include_router(ui_router, prefix="/ui")
