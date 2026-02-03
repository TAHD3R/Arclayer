from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.library.router import router as library_router

router = APIRouter()
router.include_router(library_router)
