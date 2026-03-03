from __future__ import annotations

from fastapi import APIRouter

from apps.api.src.modules.sites.portal.extensions.router import router as portal_extensions_router

router = APIRouter()
router.include_router(portal_extensions_router)
