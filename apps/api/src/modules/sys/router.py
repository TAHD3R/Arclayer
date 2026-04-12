from __future__ import annotations

from fastapi import APIRouter

from src.modules.sys.auth.router import router as sys_auth_router
from src.modules.sys.mail.router import router as sys_mail_router
from src.modules.sys.settings.router import router as sys_settings_router

router = APIRouter(tags=["Sys: Governance"])
router.include_router(sys_auth_router, prefix="/auth")
router.include_router(sys_settings_router, prefix="/settings")
router.include_router(sys_mail_router, prefix="/mail")
