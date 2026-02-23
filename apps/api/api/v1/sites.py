from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.sites.router import router as sites_router
from apps.api.modules.sites.router_delivery import router as delivery_router
from apps.api.modules.sites.router_patterns import router as patterns_router
from apps.api.modules.sites.router_public import router as sites_public_router

router = APIRouter()
router.include_router(sites_router)
router.include_router(delivery_router)
router.include_router(patterns_router)
router.include_router(sites_public_router)
