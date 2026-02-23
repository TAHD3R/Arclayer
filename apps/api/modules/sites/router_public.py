"""Public site resolution endpoint (no auth required)."""

from __future__ import annotations

from fastapi import APIRouter, Query

from apps.api.core.http.response import Response, ResponseModel
from apps.api.modules.sites.models.site import SiteRecord
from apps.api.modules.sites.schema import SiteResolveOut

router = APIRouter(prefix="/sites", tags=["Sites (Public)"])


@router.get(
    "/resolve",
    response_model=ResponseModel[SiteResolveOut],
    summary="Resolve a site by hostname",
    description="Public endpoint for Portal SSR to resolve a hostname to a site.",
)
async def resolve_site_by_host(
    host: str = Query(..., description="Hostname to resolve (e.g. myorg.celestial.app)."),
) -> ResponseModel[SiteResolveOut]:
    site = await SiteRecord.filter(primary_host=host.lower(), is_active=True).first()
    if site is None:
        from apps.api.core.exceptions import NotFound

        raise NotFound(message="Site not found for host", error="SITE_NOT_FOUND")

    return Response.success(
        data=SiteResolveOut(
            site_id=site.id,
            default_locale=site.default_locale,
            fallback_locale=site.fallback_locale,
        )
    )
