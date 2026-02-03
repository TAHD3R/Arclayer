from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.shares.router import router as shares_router

router = APIRouter()
router.include_router(shares_router)
