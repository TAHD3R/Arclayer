from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.sites.runtime.delivery_kernel import (
    SiteRuntimeDeliveryKernel,
    get_site_runtime_delivery_kernel,
)
from src.modules.sites.schema import SiteRouteResolveOut, SiteRuntimeOut

router = APIRouter(tags=["external.sites.runtime"])


@router.get(
    "/sites/{site_id}/runtime",
    response_model=ResponseModel[SiteRuntimeOut],
    response_model_exclude_none=True,
    summary="Get site runtime config (theme, fonts, site identity, SEO defaults)",
)
async def get_site_runtime(
    site_id: PublicUUID,
    raw_response: FastAPIResponse,
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
    locale: Annotated[str | None, Query(description="Resolved locale for localized settings (e.g. en-US).")] = None,
) -> ResponseModel[SiteRuntimeOut]:
    """Get site runtime config (theme, fonts, site identity, SEO defaults)."""
    raw_response.headers["cache-control"] = kernel.cache_for_mode(mode)
    return ApiResponse.success(data=await kernel.get_runtime(site_id=site_id, mode=mode, token=token, locale=locale))


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
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRouteResolveOut]:
    """Resolve site route (pathname -> page blueprint)."""
    raw_response.headers["cache-control"] = kernel.cache_for_route_mode(mode)
    return ApiResponse.success(data=await kernel.resolve_route(site_id=site_id, path=path, mode=mode, token=token))
