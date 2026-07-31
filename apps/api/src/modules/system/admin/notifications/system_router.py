from __future__ import annotations

from fastapi import APIRouter

from src.modules.system.admin.notifications.campaign_router import router as campaign_router

router = APIRouter(
    tags=["internal.system.notifications"],
)
router.include_router(campaign_router)
