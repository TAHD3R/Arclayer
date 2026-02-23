from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.sites.router import router as sites_router
from apps.api.modules.sites.router_delivery import router as delivery_router

router = APIRouter()
router.include_router(sites_router)
router.include_router(delivery_router)
