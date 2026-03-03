"""Delivery API — read-only public content distribution endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi import Response as FastAPIResponse

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.config import Settings, get_settings
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.infra.cache.valkey import get_valkey
from apps.api.src.modules.sites.delivery.schema import (
    DeliveryEntryOut,
    DeliveryMenuOut,
    DeliveryStyleOut,
)
from apps.api.src.modules.sites.service import SiteService

router = APIRouter(prefix="/sites/{site_id}/delivery", tags=["Delivery"])


def _get_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)


_CACHE_PUBLIC = "public, max-age=60, stale-while-revalidate=300"


@router.get(
    "/entries",
    response_model=ResponseModel[PageData[DeliveryEntryOut]],
    response_model_exclude_none=True,
    summary="List published entries (public)",
)
async def list_delivery_entries(
    site_id: PublicUUID,
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(_get_site_service)],
    params: PageParams = Depends(get_page_params),
    type_code: Annotated[str | None, Query(alias="type", description="Content type code filter.")] = None,
    mode: Annotated[str | None, Query(description="Display mode code.")] = None,
) -> ResponseModel[PageData[DeliveryEntryOut]]:
    raw_response.headers["cache-control"] = _CACHE_PUBLIC
    data = await service.delivery_list_entries(site_id=site_id, params=params, type_code=type_code, display_mode=mode)
    return Response.success(data=data)


@router.get(
    "/entries/{slug:path}",
    response_model=ResponseModel[DeliveryEntryOut],
    response_model_exclude_none=True,
    summary="Get a published entry by slug (public)",
)
async def get_delivery_entry(
    site_id: PublicUUID,
    slug: str,
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(_get_site_service)],
    mode: Annotated[str | None, Query(description="Display mode code.")] = None,
) -> ResponseModel[DeliveryEntryOut]:
    raw_response.headers["cache-control"] = _CACHE_PUBLIC
    data = await service.delivery_get_entry(site_id=site_id, slug=slug, display_mode=mode)
    return Response.success(data=data)


@router.get(
    "/menus/{menu_key}",
    response_model=ResponseModel[DeliveryMenuOut],
    response_model_exclude_none=True,
    summary="Get a menu by key (public)",
)
async def get_delivery_menu(
    site_id: PublicUUID,
    menu_key: str,
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(_get_site_service)],
) -> ResponseModel[DeliveryMenuOut]:
    raw_response.headers["cache-control"] = _CACHE_PUBLIC
    data = await service.delivery_get_menu(site_id=site_id, menu_key=menu_key)
    return Response.success(data=data)


@router.get(
    "/style",
    response_model=ResponseModel[DeliveryStyleOut],
    response_model_exclude_none=True,
    summary="Get effective site style (public)",
)
async def get_delivery_style(
    site_id: PublicUUID,
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(_get_site_service)],
) -> ResponseModel[DeliveryStyleOut]:
    raw_response.headers["cache-control"] = _CACHE_PUBLIC
    data = await service.delivery_get_style(site_id=site_id)
    return Response.success(data=data)
