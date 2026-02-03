from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.organization.router import router as organization_router

router = APIRouter()
router.include_router(organization_router)
