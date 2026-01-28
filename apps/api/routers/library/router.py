from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from apps.api.config import Settings, get_settings
from apps.api.routers.library.schema import PublicLibraryListQuery, PublicLibraryPageOut
from apps.api.routers.library.service import PublicLibraryService

router = APIRouter(tags=["Public: Library"])


def get_library_service(settings: Settings = Depends(get_settings)) -> PublicLibraryService:
    return PublicLibraryService(settings)


@router.get("/o/{org_slug}/library", response_model=PublicLibraryPageOut, include_in_schema=False)
async def public_library(
    request: Request,
    org_slug: str,
    query: PublicLibraryListQuery = Depends(),
    service: PublicLibraryService = Depends(get_library_service),
):
    # Content negotiation:
    # - If client Accepts text/html, returns minimal HTML for indexing.
    # - Else returns JSON (PublicLibraryPageOut).
    return await service.list_library(request=request, org_slug=org_slug, filters=query)
