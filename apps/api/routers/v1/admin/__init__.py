from __future__ import annotations

from fastapi import APIRouter

from apps.api.routers.v1.admin.menus import router as menus_router
from apps.api.routers.v1.admin.org import router as org_router
from apps.api.routers.v1.admin.plugins import router as plugins_router
from apps.api.routers.v1.admin.rbac import router as rbac_router
from apps.api.routers.v1.admin.rbac_org import router as rbac_org_router
from apps.api.routers.v1.admin.ui.router import router as ui_router
from apps.api.routers.v1.admin.users import router as users_router

router = APIRouter()

router.include_router(menus_router, prefix="/menus")
router.include_router(org_router, prefix="/org")
router.include_router(plugins_router, prefix="/plugins-manager")
router.include_router(rbac_router, prefix="/rbac")
router.include_router(rbac_org_router, prefix="/rbac-org")
router.include_router(users_router, prefix="/users")
router.include_router(ui_router, prefix="/ui")
