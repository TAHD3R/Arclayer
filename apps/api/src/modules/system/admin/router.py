from __future__ import annotations

from fastapi import APIRouter

from apps.api.src.modules.system.admin.menus.router import router as admin_menus_router
from apps.api.src.modules.system.admin.notifications.me.router import router as my_notifications_router
from apps.api.src.modules.system.admin.notifications.router import router as workspace_notifications_router

router = APIRouter()
router.include_router(admin_menus_router)
router.include_router(workspace_notifications_router)
router.include_router(my_notifications_router)
