from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Body, Depends, Query, status
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.core.middleware.guard_decorators import guard_rate_limit
from src.modules.projects.runtime.facade import (
    ProjectRuntimeDeliveryFacade,
    get_project_runtime_delivery_facade,
)
from src.modules.projects.runtime.schema import RuntimePreviewTokenOut
from src.modules.sites.delivery.schema import (
    DeliveryGlobalSetOut,
    DeliveryMenuOut,
    DeliveryPageOut,
    DeliveryPerspective,
    DeliverySectionOut,
    DeliveryStyleOut,
)
from src.modules.sites.preview.tokens.schema import SitePreviewTokenCreateIn
from src.modules.sites.schema import SiteRouteResolveOut, SiteRuntimeOut

router = APIRouter(prefix="/runtimes/{runtime_id}", tags=["external.runtimes"])
PREVIEW_TOKEN_CREATE_RATE_LIMIT = (10, 60)


@guard_rate_limit(*PREVIEW_TOKEN_CREATE_RATE_LIMIT)
@router.post(
    "/preview-tokens",
    response_model=ResponseModel[RuntimePreviewTokenOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create a preview token for a runtime",
)
async def create_runtime_preview_token(
    runtime_id: PublicUUID,
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
    payload: Annotated[
        SitePreviewTokenCreateIn,
        Body(description="Preview token request."),
    ] = SitePreviewTokenCreateIn(),
) -> ResponseModel[RuntimePreviewTokenOut]:
    return ApiResponse.success(
        data=await facade.create_runtime_preview_token(
            runtime_id=runtime_id,
            ttl_seconds=payload.ttl_seconds,
        )
    )


@router.get(
    "/runtime",
    response_model=ResponseModel[SiteRuntimeOut],
    response_model_exclude_none=True,
    summary="Get runtime config by runtime id",
)
async def get_runtime_config(
    runtime_id: PublicUUID,
    raw_response: FastAPIResponse,
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
    locale: Annotated[str | None, Query(description="Resolved locale for localized settings (e.g. en-US).")] = None,
) -> ResponseModel[SiteRuntimeOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=300, stale-while-revalidate=3600"
    )
    return ApiResponse.success(
        data=await facade.get_runtime(
            runtime_id=runtime_id,
            mode=mode,
            token=token,
            locale=locale,
        )
    )


@router.get(
    "/routes/resolve",
    response_model=ResponseModel[SiteRouteResolveOut],
    response_model_exclude_none=True,
    summary="Resolve a runtime route",
)
async def resolve_runtime_route(
    runtime_id: PublicUUID,
    path: Annotated[str, Query(..., description="Request pathname (e.g. /blog/hello).")],
    raw_response: FastAPIResponse,
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRouteResolveOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await facade.resolve_route(
            runtime_id=runtime_id,
            path=path,
            mode=mode,
            token=token,
        )
    )


@router.get(
    "/delivery/menus/{menu_key}",
    response_model=ResponseModel[DeliveryMenuOut],
    response_model_exclude_none=True,
    summary="Get a runtime menu by key",
)
async def get_runtime_delivery_menu(
    runtime_id: PublicUUID,
    menu_key: str,
    raw_response: FastAPIResponse,
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
) -> ResponseModel[DeliveryMenuOut]:
    raw_response.headers["cache-control"] = "public, max-age=60, stale-while-revalidate=300"
    return ApiResponse.success(data=await facade.get_delivery_menu(runtime_id=runtime_id, menu_key=menu_key))


@router.get(
    "/delivery/style",
    response_model=ResponseModel[DeliveryStyleOut],
    response_model_exclude_none=True,
    summary="Get effective runtime style",
)
async def get_runtime_delivery_style(
    runtime_id: PublicUUID,
    raw_response: FastAPIResponse,
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
) -> ResponseModel[DeliveryStyleOut]:
    raw_response.headers["cache-control"] = "public, max-age=60, stale-while-revalidate=300"
    return ApiResponse.success(data=await facade.get_delivery_style(runtime_id=runtime_id))


@router.get(
    "/delivery/pages/resolve",
    response_model=ResponseModel[DeliveryPageOut],
    response_model_exclude_none=True,
    summary="Resolve a runtime page by request path",
)
async def resolve_runtime_delivery_page(
    runtime_id: PublicUUID,
    path: Annotated[str, Query(..., description="Request pathname (e.g. /blog/hello).")],
    raw_response: FastAPIResponse,
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await facade.resolve_delivery_page(
            runtime_id=runtime_id,
            path=path,
            perspective=perspective,
            token=token,
        )
    )


@router.get(
    "/delivery/pages/{page_id}",
    response_model=ResponseModel[DeliveryPageOut],
    response_model_exclude_none=True,
    summary="Get a runtime page by id",
)
async def get_runtime_delivery_page_by_id(
    runtime_id: PublicUUID,
    page_id: PublicUUID,
    raw_response: FastAPIResponse,
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await facade.get_delivery_page_by_id(
            runtime_id=runtime_id,
            page_id=page_id,
            perspective=perspective,
            token=token,
        )
    )


@router.get(
    "/delivery/sections/{alias}",
    response_model=ResponseModel[DeliverySectionOut],
    response_model_exclude_none=True,
    summary="Get a runtime reusable section by alias",
)
async def get_runtime_delivery_section_by_alias(
    runtime_id: PublicUUID,
    alias: str,
    raw_response: FastAPIResponse,
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliverySectionOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await facade.get_delivery_section_by_alias(
            runtime_id=runtime_id,
            alias=alias,
            perspective=perspective,
            token=token,
        )
    )


@router.get(
    "/delivery/global-sets/{key}",
    response_model=ResponseModel[DeliveryGlobalSetOut],
    response_model_exclude_none=True,
    summary="Resolve a runtime global set by key",
)
async def resolve_runtime_delivery_global_set(
    runtime_id: PublicUUID,
    key: str,
    raw_response: FastAPIResponse,
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryGlobalSetOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await facade.get_delivery_global_set(
            runtime_id=runtime_id,
            key=key,
            perspective=perspective,
            token=token,
        )
    )
