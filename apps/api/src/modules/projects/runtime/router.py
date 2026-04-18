from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Body, Depends, Query, Request, status
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.core.logging import get_logger
from src.core.middleware.guard_decorators import guard_rate_limit
from src.modules.projects.runtime.schema import RuntimePreviewTokenOut
from src.modules.projects.runtime.service import ProjectRuntimeService
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
from src.modules.sites.service import SiteService
from src.platform.cache.valkey import get_valkey

router = APIRouter(prefix="/runtimes/{runtime_id}", tags=["external.runtimes"])
logger = get_logger(__name__)
PREVIEW_TOKEN_CREATE_RATE_LIMIT = (10, 60)
_CACHE_PUBLIC = "public, max-age=60, stale-while-revalidate=300"
_CACHE_PREVIEW = "no-store"


def get_project_runtime_service(settings: Settings = Depends(get_settings)) -> ProjectRuntimeService:
    return ProjectRuntimeService(settings)


def get_runtime_site_service(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> SiteService:
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteService(settings, valkey=valkey)


def _cache_for_perspective(perspective: DeliveryPerspective) -> str:
    return _CACHE_PREVIEW if perspective == "preview" else _CACHE_PUBLIC


def _mode_for_perspective(perspective: DeliveryPerspective) -> Literal["public", "preview"]:
    return "preview" if perspective == "preview" else "public"


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
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    site_service: Annotated[SiteService, Depends(get_runtime_site_service)],
    payload: Annotated[
        SitePreviewTokenCreateIn,
        Body(description="Preview token request."),
    ] = SitePreviewTokenCreateIn(),
) -> ResponseModel[RuntimePreviewTokenOut]:
    context = await runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
    token = await site_service.create_preview_token(
        site_id=context.site_id,
        ttl_seconds=payload.ttl_seconds,
    )
    return ApiResponse.success(data=runtime_service.to_preview_token_out(context=context, token=token))


@router.get(
    "/runtime",
    response_model=ResponseModel[SiteRuntimeOut],
    response_model_exclude_none=True,
    summary="Get runtime config by runtime id",
)
async def get_runtime_config(
    runtime_id: PublicUUID,
    raw_response: FastAPIResponse,
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    site_service: Annotated[SiteService, Depends(get_runtime_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
    locale: Annotated[str | None, Query(description="Resolved locale for localized settings (e.g. en-US).")] = None,
) -> ResponseModel[SiteRuntimeOut]:
    context = await runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
    await site_service.assert_preview_access_async(site_id=context.site_id, mode=mode, token=token)
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=300, stale-while-revalidate=3600"
    )
    data = await site_service.get_runtime(site_id=context.site_id, mode=mode, locale=locale)
    return ApiResponse.success(data=data)


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
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    site_service: Annotated[SiteService, Depends(get_runtime_site_service)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRouteResolveOut]:
    context = await runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
    await site_service.assert_preview_access_async(site_id=context.site_id, mode=mode, token=token)
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    data = await site_service.resolve_route(site_id=context.site_id, path=path, mode=mode)
    return ApiResponse.success(data=data)


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
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    site_service: Annotated[SiteService, Depends(get_runtime_site_service)],
) -> ResponseModel[DeliveryMenuOut]:
    context = await runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
    raw_response.headers["cache-control"] = _CACHE_PUBLIC
    data = await site_service.delivery_get_menu(site_id=context.site_id, menu_key=menu_key)
    return ApiResponse.success(data=data)


@router.get(
    "/delivery/style",
    response_model=ResponseModel[DeliveryStyleOut],
    response_model_exclude_none=True,
    summary="Get effective runtime style",
)
async def get_runtime_delivery_style(
    runtime_id: PublicUUID,
    raw_response: FastAPIResponse,
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    site_service: Annotated[SiteService, Depends(get_runtime_site_service)],
) -> ResponseModel[DeliveryStyleOut]:
    context = await runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
    raw_response.headers["cache-control"] = _CACHE_PUBLIC
    data = await site_service.delivery_get_style(site_id=context.site_id)
    return ApiResponse.success(data=data)


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
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    site_service: Annotated[SiteService, Depends(get_runtime_site_service)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    context = await runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
    await site_service.assert_preview_access_async(
        site_id=context.site_id,
        mode=_mode_for_perspective(perspective),
        token=token,
    )
    raw_response.headers["cache-control"] = _cache_for_perspective(perspective)
    data = await site_service.delivery_resolve_page(
        site_id=context.site_id,
        path=path,
        perspective=perspective,
    )
    if data is None:
        from src.core.exceptions import NotFound

        logger.warning(
            "Runtime delivery page route not found",
            path=path,
            perspective=perspective,
            runtime_id=str(runtime_id),
            site_id=str(context.site_id),
        )
        raise NotFound("Route not found", error="PAGE_ROUTE_NOT_FOUND")
    return ApiResponse.success(data=data)


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
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    site_service: Annotated[SiteService, Depends(get_runtime_site_service)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    context = await runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
    await site_service.assert_preview_access_async(
        site_id=context.site_id,
        mode=_mode_for_perspective(perspective),
        token=token,
    )
    raw_response.headers["cache-control"] = _cache_for_perspective(perspective)
    data = await site_service.delivery_get_page_by_id(
        site_id=context.site_id,
        page_id=page_id,
        perspective=perspective,
    )
    if data is None:
        from src.core.exceptions import NotFound

        logger.warning(
            "Runtime delivery page lookup failed",
            page_id=str(page_id),
            perspective=perspective,
            runtime_id=str(runtime_id),
            site_id=str(context.site_id),
        )
        raise NotFound("Page not found", error="PAGE_NOT_FOUND")
    return ApiResponse.success(data=data)


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
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    site_service: Annotated[SiteService, Depends(get_runtime_site_service)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliverySectionOut]:
    context = await runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
    await site_service.assert_preview_access_async(
        site_id=context.site_id,
        mode=_mode_for_perspective(perspective),
        token=token,
    )
    raw_response.headers["cache-control"] = _cache_for_perspective(perspective)
    data = await site_service.delivery_get_section_by_alias(
        site_id=context.site_id,
        alias=alias,
        perspective=perspective,
    )
    return ApiResponse.success(data=data)


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
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    site_service: Annotated[SiteService, Depends(get_runtime_site_service)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryGlobalSetOut]:
    context = await runtime_service.get_context_by_runtime(runtime_id=runtime_id, actor_user_id=None)
    await site_service.assert_preview_access_async(
        site_id=context.site_id,
        mode=_mode_for_perspective(perspective),
        token=token,
    )
    raw_response.headers["cache-control"] = _cache_for_perspective(perspective)
    data = await site_service.delivery_get_global_set(
        site_id=context.site_id,
        key=key,
        perspective=perspective,
    )
    return ApiResponse.success(data=data)
