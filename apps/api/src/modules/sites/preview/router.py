from __future__ import annotations

from fastapi import APIRouter

from src.modules.sites.preview.tokens.router import router as preview_tokens_router

router = APIRouter()
router.include_router(preview_tokens_router)
