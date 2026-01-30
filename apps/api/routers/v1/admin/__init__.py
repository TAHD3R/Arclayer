from __future__ import annotations

from fastapi import APIRouter

from apps.api.routers.v1.admin.assets import router as assets_router
from apps.api.routers.v1.admin.menus import router as menus_router
from apps.api.routers.v1.admin.plugins import router as plugins_router
from apps.api.routers.v1.admin.rbac import router as rbac_router
from apps.api.routers.v1.admin.settings import router as settings_router
from apps.api.routers.v1.admin.shares import router as shares_router
from apps.api.routers.v1.admin.team import router as team_router
from apps.api.routers.v1.admin.uploads import router as uploads_router
from apps.api.routers.v1.admin.usages import router as usages_router
from apps.api.routers.v1.admin.users import router as users_router

router = APIRouter()

router.include_router(menus_router, prefix="/menus")
router.include_router(plugins_router, prefix="/plugins-manager")
router.include_router(settings_router, prefix="/settings")
router.include_router(rbac_router, prefix="/rbac")
router.include_router(users_router, prefix="/users")
router.include_router(team_router, prefix="/team")
router.include_router(uploads_router)
router.include_router(assets_router)
router.include_router(shares_router)
router.include_router(usages_router)
