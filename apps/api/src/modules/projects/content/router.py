from __future__ import annotations

from fastapi import APIRouter

from src.modules.projects.content.bindings.router import router as project_content_bindings_router
from src.modules.projects.content.items.router import router as project_content_items_router
from src.modules.projects.content.models.router import router as project_content_models_router
from src.modules.projects.content.presentations.router import router as project_content_presentations_router
from src.modules.projects.content.routing.router import router as project_content_routing_router
from src.modules.projects.content.seo.router import router as project_content_seo_router
from src.modules.projects.content.views.router import router as project_content_views_router

router = APIRouter(tags=["domain.projects.content"])
router.include_router(project_content_models_router)
router.include_router(project_content_items_router)
router.include_router(project_content_presentations_router)
router.include_router(project_content_seo_router)
router.include_router(project_content_bindings_router)
router.include_router(project_content_routing_router)
router.include_router(project_content_views_router)
