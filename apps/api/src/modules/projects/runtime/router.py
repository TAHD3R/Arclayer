from __future__ import annotations

import asyncio
from typing import Annotated, Literal
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Body, Depends, Query, Request, status
from fastapi import Response as FastAPIResponse

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.events import Event, events
from src.core.http.response import ApiResponse, ResponseModel
from src.core.logging import get_logger
from src.modules.auth.content_api.service import ContentApiAuthService, ContentApiCredential
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.router_helpers import (
    get_project_runtime_context,
    get_project_runtime_service,
    require_project_permission,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.service import ProjectRuntimeContext, ProjectRuntimeService
from src.modules.projects.runtime.site.schema import ProjectRuntimeSiteOut
from src.modules.sites.delivery.schema import (
    DeliveryGlobalSetOut,
    DeliveryMenuOut,
    DeliveryPageOut,
    DeliveryPerspective,
    DeliverySectionOut,
    DeliveryStyleOut,
)
from src.modules.sites.preview.tokens.schema import SitePreviewTokenCreateIn
from src.modules.sites.runtime.delivery_kernel import (
    RuntimeDeliveryTarget,
    SiteRuntimeDeliveryKernel,
    get_site_runtime_delivery_kernel,
)
from src.modules.sites.schema import SitePreviewTokenOut, SiteRouteResolveOut, SiteRuntimeOut

project_router = APIRouter(prefix="/projects/{project_id}", tags=["domain.projects.runtime"])
logger = get_logger(__name__)
_FATAL_PROJECT_EVENT_ERRORS = (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_PROJECT_EVENT_ERRORS):
        raise exc


async def get_runtime_context(
    runtime_id: PublicUUID,
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
) -> ProjectRuntimeContext:
    return await runtime_service.get_context_by_runtime(
        runtime_id=runtime_id,
        actor_user_id=None,
    )


def _runtime_delivery_target(runtime_context: ProjectRuntimeContext) -> RuntimeDeliveryTarget:
    return RuntimeDeliveryTarget(
        runtime_id=runtime_context.runtime_id,
        site_id=runtime_context.site_id,
        tenant_context=runtime_context.tenant_context,
    )


def get_content_api_auth_service(settings: Settings = Depends(get_settings)) -> ContentApiAuthService:
    return ContentApiAuthService(settings)


async def get_optional_runtime_delivery_credential(
    request: Request,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    auth_service: Annotated[ContentApiAuthService, Depends(get_content_api_auth_service)],
) -> ContentApiCredential | None:
    return await auth_service.authenticate_optional_delivery_key(
        request=request,
        site_id=runtime_context.site_id,
        required_action="project:delivery:read",
    )


router = APIRouter(
    prefix="/runtimes/{runtime_id}",
    tags=["external.runtimes"],
    dependencies=[Depends(get_optional_runtime_delivery_credential)],
)


@project_router.get(
    "/site",
    response_model=ResponseModel[ProjectRuntimeSiteOut],
    response_model_exclude_none=True,
    summary="Get project site",
    dependencies=[require_project_permission("project:site:read")],
)
async def get_project_site_runtime(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
) -> ResponseModel[ProjectRuntimeSiteOut]:
    context = await runtime_service.get_context_by_project(project_id=ctx.project_id, actor_user_id=actor_user_id)
    return ApiResponse.success(data=runtime_service.to_project_site_out(context))


@project_router.post(
    "/site/preview-tokens",
    response_model=ResponseModel[SitePreviewTokenOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Issue a preview token for a project site",
    dependencies=[require_project_permission("project:site:manage")],
)
async def create_project_site_preview_token(
    payload: Annotated[SitePreviewTokenCreateIn, Body(description="Preview token request.")],
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
) -> ResponseModel[SitePreviewTokenOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await kernel.create_preview_token(
        target=_runtime_delivery_target(runtime_context),
        ttl_seconds=payload.ttl_seconds,
    )
    try:
        await events.publish_and_wait(
            Event(
                name="project.preview_token.created",
                payload={
                    "entity_id": str(runtime_context.site_id),
                    "entity_type": "preview_token",
                    "expires_at_ms": data.expires_at_ms,
                    "organization_id": str(ctx.organization_id),
                    "project_id": str(ctx.project_id),
                    "site_id": str(runtime_context.site_id),
                    "ttl_seconds": payload.ttl_seconds,
                    "workspace_id": str(runtime_context.workspace_id),
                },
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id),
            ),
            timeout=1.0,
        )
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning(
            "Project preview token event publish failed",
            actor_user_id=str(actor_user_id),
            event_name="project.preview_token.created",
            project_id=str(ctx.project_id),
            site_id=str(runtime_context.site_id),
            error=str(exc),
        )
    return ApiResponse.success(data=data)


@router.get(
    "/runtime",
    response_model=ResponseModel[SiteRuntimeOut],
    response_model_exclude_none=True,
    summary="Get runtime config by runtime id",
)
async def get_runtime_config(
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
    locale: Annotated[str | None, Query(description="Resolved locale for localized settings (e.g. en-US).")] = None,
) -> ResponseModel[SiteRuntimeOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=300, stale-while-revalidate=3600"
    )
    return ApiResponse.success(
        data=await kernel.get_runtime(
            target=_runtime_delivery_target(runtime_context),
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
    path: Annotated[str, Query(..., description="Request pathname (e.g. /blog/hello).")],
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    mode: Annotated[Literal["public", "preview"], Query(description="Runtime mode.")] = "public",
    token: Annotated[str | None, Query(description="Preview token (required when mode=preview).")] = None,
) -> ResponseModel[SiteRouteResolveOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if mode == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await kernel.resolve_route(
            target=_runtime_delivery_target(runtime_context),
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
    menu_key: str,
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
) -> ResponseModel[DeliveryMenuOut]:
    raw_response.headers["cache-control"] = "public, max-age=60, stale-while-revalidate=300"
    return ApiResponse.success(
        data=await kernel.get_delivery_menu(
            target=_runtime_delivery_target(runtime_context),
            menu_key=menu_key,
        )
    )


@router.get(
    "/delivery/style",
    response_model=ResponseModel[DeliveryStyleOut],
    response_model_exclude_none=True,
    summary="Get effective runtime style",
)
async def get_runtime_delivery_style(
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
) -> ResponseModel[DeliveryStyleOut]:
    raw_response.headers["cache-control"] = "public, max-age=60, stale-while-revalidate=300"
    return ApiResponse.success(data=await kernel.get_delivery_style(target=_runtime_delivery_target(runtime_context)))


@router.get(
    "/delivery/pages/resolve",
    response_model=ResponseModel[DeliveryPageOut],
    response_model_exclude_none=True,
    summary="Resolve a runtime page by request path",
)
async def resolve_runtime_delivery_page(
    path: Annotated[str, Query(..., description="Request pathname (e.g. /blog/hello).")],
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await kernel.resolve_delivery_page(
            target=_runtime_delivery_target(runtime_context),
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
    page_id: PublicUUID,
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryPageOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await kernel.get_delivery_page_by_id(
            target=_runtime_delivery_target(runtime_context),
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
    alias: str,
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliverySectionOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await kernel.get_delivery_section_by_alias(
            target=_runtime_delivery_target(runtime_context),
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
    key: str,
    raw_response: FastAPIResponse,
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    kernel: Annotated[SiteRuntimeDeliveryKernel, Depends(get_site_runtime_delivery_kernel)],
    perspective: Annotated[DeliveryPerspective, Query(description="Delivery perspective.")] = "published",
    token: Annotated[str | None, Query(description="Preview token (required when perspective=preview).")] = None,
) -> ResponseModel[DeliveryGlobalSetOut]:
    raw_response.headers["cache-control"] = (
        "no-store" if perspective == "preview" else "public, max-age=60, stale-while-revalidate=300"
    )
    return ApiResponse.success(
        data=await kernel.get_delivery_global_set(
            target=_runtime_delivery_target(runtime_context),
            key=key,
            perspective=perspective,
            token=token,
        )
    )
