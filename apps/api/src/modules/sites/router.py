from __future__ import annotations

from fastapi import APIRouter

from apps.api.src.modules.sites.domains.router import router as site_domains_router
from apps.api.src.modules.sites.entries.router import router as entries_router
from apps.api.src.modules.sites.entry.router import router as entry_types_router
from apps.api.src.modules.sites.pages.router import router as pages_router
from apps.api.src.modules.sites.portal.router import router as portal_extensions_router
from apps.api.src.modules.sites.presence.router import router as presence_router
from apps.api.src.modules.sites.preview.router import router as preview_tokens_router
from apps.api.src.modules.sites.routes.router import router as routes_router
from apps.api.src.modules.sites.routing.templates.router import router as route_templates_router
from apps.api.src.modules.sites.runtime.router import router as runtime_router
from apps.api.src.modules.sites.settings.router import router as settings_router
from apps.api.src.modules.sites.sitemap.router import router as sitemap_router

router = APIRouter(tags=["Sites"])
router.include_router(portal_extensions_router)
router.include_router(site_domains_router)
router.include_router(runtime_router)
router.include_router(preview_tokens_router)
router.include_router(routes_router)
router.include_router(entries_router)
router.include_router(entry_types_router)
router.include_router(pages_router)
router.include_router(route_templates_router)
router.include_router(presence_router)
router.include_router(settings_router)
router.include_router(sitemap_router)
