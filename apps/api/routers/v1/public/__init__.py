from __future__ import annotations

from fastapi import APIRouter

from apps.api.routers.v1.auth.router import router as auth_router

router = APIRouter(tags=["public"])

router.include_router(auth_router, prefix="/auth")
