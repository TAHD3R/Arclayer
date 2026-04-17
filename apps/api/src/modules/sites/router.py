from __future__ import annotations

from fastapi import APIRouter

from src.modules.sites.delivery.router import router as delivery_router
from src.modules.sites.domains.router import router as site_domains_router
from src.modules.sites.presence.router import router as presence_router
from src.modules.sites.preview.router import router as preview_tokens_router
from src.modules.sites.runtime.router import router as runtime_router
from src.modules.sites.settings.router import router as settings_router
from src.modules.sites.sitemap.router import router as sitemap_router

router = APIRouter(tags=["domain.sites"])
router.include_router(site_domains_router)
router.include_router(delivery_router)
router.include_router(runtime_router)
router.include_router(preview_tokens_router)
router.include_router(presence_router)
router.include_router(settings_router)
router.include_router(sitemap_router)
