from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from apps.api.config import Settings, get_settings
from apps.api.core.http.response import Response, ResponseModel
from apps.api.routers.v1.sites.schema import SiteResolveOut, SiteRouteResolveOut, SiteRuntimeOut
from apps.api.routers.v1.sites.service import SiteService

router = APIRouter(tags=["Sites"])


def get_site_service(settings: Settings = Depends(get_settings)) -> SiteService:
    return SiteService(settings)


@router.get(
    "/sites/resolve",
    response_model=ResponseModel[SiteResolveOut],
    response_model_exclude_none=True,
    summary="Resolve site by request host",
)
async def resolve_site(
    host: Annotated[str, Query(..., description="Request host (e.g. example.com).")],
    service: Annotated[SiteService, Depends(get_site_service)],
) -> ResponseModel[SiteResolveOut]:
    data = await service.resolve_site(host=host)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/runtime",
    response_model=ResponseModel[SiteRuntimeOut],
    response_model_exclude_none=True,
    summary="Get site runtime config (theme tokens, fonts)",
)
async def get_site_runtime(
    site_id: str,
    service: Annotated[SiteService, Depends(get_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRuntimeOut]:
    _ = token
    data = await service.get_runtime(site_id=site_id, mode=mode)
    return Response.success(data=data)


@router.get(
    "/sites/{site_id}/routes/resolve",
    response_model=ResponseModel[SiteRouteResolveOut],
    response_model_exclude_none=True,
    summary="Resolve site route (pathname -> document)",
)
async def resolve_site_route(
    site_id: str,
    path: Annotated[str, Query(..., description="Request pathname (e.g. /blog/hello).")],
    service: Annotated[SiteService, Depends(get_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRouteResolveOut]:
    _ = token
    data = await service.resolve_route(site_id=site_id, path=path, mode=mode)
    return Response.success(data=data)
