from __future__ import annotations

from fastapi import APIRouter

from apps.api.modules.assets.router import router as public_assets_router
from apps.api.modules.library.router import router as public_library_router
from apps.api.modules.shares.router import router as public_shares_router


def build_root_router() -> APIRouter:
    root = APIRouter()
    # Public, non-versioned asset delivery (Range-supported).
    root.include_router(public_assets_router)
    # Public, non-versioned share links (Range-supported).
    root.include_router(public_shares_router)
    # Public, non-versioned public library entry (HTML + JSON).
    root.include_router(public_library_router)
    return root
