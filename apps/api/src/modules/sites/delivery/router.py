"""Delivery API — read-only public content distribution endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.sites.delivery.schema import (
    DeliveryGlobalSetOut,
    DeliveryMenuOut,
    DeliveryPageOut,
    DeliveryPerspective,
    DeliverySectionOut,
    DeliveryStyleOut,
)
from src.modules.sites.runtime.delivery_kernel import (
    SiteRuntimeDeliveryKernel,
    get_site_runtime_delivery_kernel,
)

router = APIRouter(prefix="/sites/{site_id}/delivery", tags=["external.sites.delivery"])


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
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
) -> ResponseModel[DeliveryMenuOut]:
    """Get a menu by key (public)."""
    raw_response.headers["cache-control"] = kernel.cache_for_perspective("published")
    return ApiResponse.success(data=await kernel.get_delivery_menu(site_id=site_id, menu_key=menu_key))


@router.get(
    "/style",
    response_model=ResponseModel[DeliveryStyleOut],
    response_model_exclude_none=True,
    summary="Get effective site style (public)",
)
async def get_delivery_style(
    site_id: PublicUUID,
    raw_response: FastAPIResponse,
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
) -> ResponseModel[DeliveryStyleOut]:
    """Get effective site style (public)."""
    raw_response.headers["cache-control"] = kernel.cache_for_perspective("published")
    return ApiResponse.success(data=await kernel.get_delivery_style(site_id=site_id))


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
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    """Resolve a page by request path."""
    raw_response.headers["cache-control"] = kernel.cache_for_perspective(perspective)
    return ApiResponse.success(
        data=await kernel.resolve_delivery_page(
            site_id=site_id,
            path=path,
            perspective=perspective,
            token=token,
        )
    )


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
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    """Get a page by id."""
    raw_response.headers["cache-control"] = kernel.cache_for_perspective(perspective)
    return ApiResponse.success(
        data=await kernel.get_delivery_page_by_id(
            site_id=site_id,
            page_id=page_id,
            perspective=perspective,
            token=token,
        )
    )


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
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliverySectionOut]:
    """Get a reusable section by alias."""
    raw_response.headers["cache-control"] = kernel.cache_for_perspective(perspective)
    return ApiResponse.success(
        data=await kernel.get_delivery_section_by_alias(
            site_id=site_id,
            alias=alias,
            perspective=perspective,
            token=token,
        )
    )


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
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryGlobalSetOut]:
    """Resolve a global set by key."""
    raw_response.headers["cache-control"] = kernel.cache_for_perspective(perspective)
    return ApiResponse.success(
        data=await kernel.get_delivery_global_set(
            site_id=site_id,
            key=key,
            perspective=perspective,
            token=token,
        )
    )
