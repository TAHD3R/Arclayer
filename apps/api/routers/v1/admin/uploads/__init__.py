from __future__ import annotations

from fastapi import APIRouter

from apps.api.routers.v1.admin.uploads.router import router as uploads_router

router = APIRouter()
router.include_router(uploads_router)
