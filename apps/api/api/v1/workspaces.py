from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.workspaces.router import router as workspaces_router

router = APIRouter()
router.include_router(workspaces_router)
