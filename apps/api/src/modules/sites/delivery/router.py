"""Delivery API — read-only public content distribution endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.sites.delivery.schema import DeliveryMenuOut, DeliveryStyleOut
from src.modules.sites.service import SiteService
from src.platform.cache.valkey import get_valkey

router = APIRouter(prefix="/sites/{site_id}/delivery", tags=["external.sites.delivery"])


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
    """Get a menu by key (public)."""
    raw_response.headers["cache-control"] = _CACHE_PUBLIC
    data = await service.delivery_get_menu(site_id=site_id, menu_key=menu_key)
    return ApiResponse.success(data=data)


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
    """Get effective site style (public)."""
    raw_response.headers["cache-control"] = _CACHE_PUBLIC
    data = await service.delivery_get_style(site_id=site_id)
    return ApiResponse.success(data=data)
