"""Delivery API — read-only public content distribution endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.sites.delivery.schema import (
    DeliveryGlobalSetOut,
    DeliveryMenuOut,
    DeliveryPageOut,
    DeliveryPerspective,
    DeliverySectionOut,
    DeliveryStyleOut,
)
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
_CACHE_PREVIEW = "no-store"


def _cache_for_perspective(perspective: DeliveryPerspective) -> str:
    return _CACHE_PREVIEW if perspective == "preview" else _CACHE_PUBLIC


def _mode_for_perspective(perspective: DeliveryPerspective) -> str:
    return "preview" if perspective == "preview" else "public"


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


@router.get(
    "/pages/resolve",
    response_model=ResponseModel[DeliveryPageOut],
    response_model_exclude_none=True,
    summary="Resolve a page by request path",
)
async def resolve_delivery_page(
    site_id: PublicUUID,
    path: Annotated[str, Query(..., description="Request pathname (e.g. /blog/hello).")],
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(_get_site_service)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    """Resolve a page by request path."""
    await service.assert_preview_access_async(site_id=site_id, mode=_mode_for_perspective(perspective), token=token)
    raw_response.headers["cache-control"] = _cache_for_perspective(perspective)
    data = await service.delivery_resolve_page(site_id=site_id, path=path, perspective=perspective)
    if data is None:
        from src.core.exceptions import NotFound

        raise NotFound("Route not found", error="PAGE_ROUTE_NOT_FOUND")
    return ApiResponse.success(data=data)


@router.get(
    "/pages/{page_id}",
    response_model=ResponseModel[DeliveryPageOut],
    response_model_exclude_none=True,
    summary="Get a page by id",
)
async def get_delivery_page_by_id(
    site_id: PublicUUID,
    page_id: PublicUUID,
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(_get_site_service)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    """Get a page by id."""
    await service.assert_preview_access_async(site_id=site_id, mode=_mode_for_perspective(perspective), token=token)
    raw_response.headers["cache-control"] = _cache_for_perspective(perspective)
    data = await service.delivery_get_page_by_id(site_id=site_id, page_id=page_id, perspective=perspective)
    if data is None:
        from src.core.exceptions import NotFound

        raise NotFound("Page not found", error="PAGE_NOT_FOUND")
    return ApiResponse.success(data=data)


@router.get(
    "/sections/{alias}",
    response_model=ResponseModel[DeliverySectionOut],
    response_model_exclude_none=True,
    summary="Get a reusable section by alias",
)
async def get_delivery_section_by_alias(
    site_id: PublicUUID,
    alias: str,
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(_get_site_service)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliverySectionOut]:
    """Get a reusable section by alias."""
    await service.assert_preview_access_async(site_id=site_id, mode=_mode_for_perspective(perspective), token=token)
    raw_response.headers["cache-control"] = _cache_for_perspective(perspective)
    data = await service.delivery_get_section_by_alias(site_id=site_id, alias=alias, perspective=perspective)
    return ApiResponse.success(data=data)


@router.get(
    "/global-sets/{key}",
    response_model=ResponseModel[DeliveryGlobalSetOut],
    response_model_exclude_none=True,
    summary="Resolve a global set by key",
)
async def resolve_delivery_global_set(
    site_id: PublicUUID,
    key: str,
    raw_response: FastAPIResponse,
    service: Annotated[SiteService, Depends(_get_site_service)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryGlobalSetOut]:
    """Resolve a global set by key."""
    await service.assert_preview_access_async(site_id=site_id, mode=_mode_for_perspective(perspective), token=token)
    raw_response.headers["cache-control"] = _cache_for_perspective(perspective)
    data = await service.delivery_get_global_set(site_id=site_id, key=key, perspective=perspective)
    return ApiResponse.success(data=data)
