from __future__ import annotations

from fastapi import APIRouter, Depends

from src.modules.auth.http.service import require_super_admin
from src.modules.system.admin.notifications.campaign_router import router as campaign_router

router = APIRouter(
    tags=["internal.system.notifications"],
    dependencies=[Depends(require_super_admin)],
)
router.include_router(campaign_router)
