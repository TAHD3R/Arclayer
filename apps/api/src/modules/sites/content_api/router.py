from __future__ import annotations

from fastapi import APIRouter

from src.modules.sites.graphql.router import router as graphql_router
from src.modules.sites.public.router import router as public_router
from src.modules.sites.sitemap.router import router as sitemap_router

router = APIRouter(tags=["external.content_api.sites"])
router.include_router(public_router)
router.include_router(graphql_router)
router.include_router(sitemap_router)
