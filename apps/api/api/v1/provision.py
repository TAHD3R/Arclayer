from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.provision.router import router as provision_router

router = APIRouter()
router.include_router(provision_router)
