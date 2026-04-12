from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.sites.http.service import get_site_service
from src.modules.sites.schema import SiteRouteResolveOut, SiteRuntimeOut
from src.modules.sites.service import SiteService

router = APIRouter(tags=["Sites"])


@router.get(
    "/sites/{site_id}/runtime",
    response_model=ResponseModel[SiteRuntimeOut],
    response_model_exclude_none=True,
    summary="Get site runtime config (theme, fonts, site identity, SEO defaults)",
)
async def get_site_runtime(
    site_id: PublicUUID,
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(get_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
    locale: Annotated[str | None, Query(description="Resolved locale for localized settings (e.g. en-US).")] = None,
) -> ResponseModel[SiteRuntimeOut]:
    await service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=300, stale-while-revalidate=3600"
    )
    data = await service.get_runtime(site_id=site_id, mode=mode, locale=locale)
    return ApiResponse.success(data=data)


@router.get(
    "/sites/{site_id}/routes/resolve",
    response_model=ResponseModel[SiteRouteResolveOut],
    response_model_exclude_none=True,
    summary="Resolve site route (pathname -> page blueprint)",
)
async def resolve_site_route(
    site_id: PublicUUID,
    path: Annotated[str, Query(..., description="Request pathname (e.g. /blog/hello).")],
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(get_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRouteResolveOut]:
    await service.assert_preview_access_async(site_id=site_id, mode=mode, token=token)
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    data = await service.resolve_route(site_id=site_id, path=path, mode=mode)
    return ApiResponse.success(data=data)
