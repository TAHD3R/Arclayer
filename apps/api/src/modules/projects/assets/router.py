from __future__ import annotations

from fastapi import APIRouter

from src.modules.projects.assets.assets_router import router as project_assets_router
from src.modules.projects.assets.uploads_router import router as project_uploads_router
from src.modules.projects.assets.usages_router import router as project_usages_router

router = APIRouter(tags=["domain.projects.assets"])
router.include_router(project_assets_router)
router.include_router(project_uploads_router)
router.include_router(project_usages_router)
