from __future__ import annotations

from fastapi import APIRouter

from apps.api.routers.v1.admin.org.router import router as org_router
from apps.api.routers.v1.admin.org.tools_router import router as org_tools_router

router = APIRouter()
router.include_router(org_router)
router.include_router(org_tools_router, prefix="/tools")

__all__ = ["router", "APIRouter"]
