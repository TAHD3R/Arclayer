from __future__ import annotations

from fastapi import APIRouter

from apps.api.src.modules.assets.admin.assets.router import router as admin_assets_router
from apps.api.src.modules.assets.admin.uploads.router import router as admin_uploads_router
from apps.api.src.modules.assets.admin.usages.router import router as admin_usages_router

router = APIRouter()
router.include_router(admin_assets_router)
router.include_router(admin_uploads_router)
router.include_router(admin_usages_router)
