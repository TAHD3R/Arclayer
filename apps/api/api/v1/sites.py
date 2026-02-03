from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.sites.router import router as sites_router

router = APIRouter()
router.include_router(sites_router)
