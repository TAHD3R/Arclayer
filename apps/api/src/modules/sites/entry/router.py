from __future__ import annotations

from fastapi import APIRouter

from apps.api.src.modules.sites.entry.types.router import router as entry_types_router

router = APIRouter()
router.include_router(entry_types_router)
