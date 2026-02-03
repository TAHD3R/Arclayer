from __future__ import annotations

from fastapi import APIRouter

from apps.api.api.assets import router as assets_router
from apps.api.api.library import router as library_router
from apps.api.api.shares import router as shares_router


def build_root_router() -> APIRouter:
    root = APIRouter()
    # Public, non-versioned asset delivery (Range-supported).
    root.include_router(assets_router)
    # Public, non-versioned share links (Range-supported).
    root.include_router(shares_router)
    # Public, non-versioned public library entry (HTML + JSON).
    root.include_router(library_router)
    return root
