from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response as RawResponse

from src.common.types.public_uuid import PublicUUID
from src.modules.sites.http.service import get_site_service
from src.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])


@router.get(
    "/sites/{site_id}/sitemap.xml",
    response_class=RawResponse,
    summary="Get sitemap.xml (public)",
)
async def get_sitemap_xml(
    site_id: PublicUUID,
    service: Annotated[SiteService, Depends(get_site_service)],
) -> RawResponse:
    xml = await service.get_sitemap_xml(site_id=site_id)
    return RawResponse(
        content=xml,
        media_type="application/xml",
        headers={"cache-control": "public, max-age=300"},
    )
