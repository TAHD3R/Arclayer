from __future__ import annotations

import asyncio
from typing import Annotated
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Body, Depends, status

from src.core.events import Event, events
from src.core.http.response import ApiResponse, ResponseModel
from src.core.logging import get_logger
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.http.router_helpers import (
    require_project_permission,
    require_project_workspace_permission,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.facade import (
    ProjectRuntimeDeliveryFacade,
    get_project_runtime_delivery_facade,
)
from src.modules.projects.runtime.site.schema import ProjectRuntimeSiteOut
from src.modules.sites.schema import SitePreviewTokenCreateIn, SitePreviewTokenOut

router = APIRouter(prefix="/projects/{project_id}", tags=["domain.projects.runtime"])
logger = get_logger(__name__)
_FATAL_PROJECT_EVENT_ERRORS = (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_PROJECT_EVENT_ERRORS):
        raise exc


@router.get(
    "/site",
    response_model=ResponseModel[ProjectRuntimeSiteOut],
    response_model_exclude_none=True,
    summary="Get project site bridge",
    dependencies=[require_project_permission("system:site:read")],
)
async def get_project_site(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
) -> ResponseModel[ProjectRuntimeSiteOut]:
    return ApiResponse.success(
        data=await facade.get_project_site(project_id=ctx.project_id, actor_user_id=actor_user_id)
    )


@router.post(
    "/site/preview-tokens",
    response_model=ResponseModel[SitePreviewTokenOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Issue a preview token for a project site",
    dependencies=[require_project_workspace_permission("system:site:manage")],
)
async def create_project_site_preview_token(
    payload: Annotated[SitePreviewTokenCreateIn, Body(description="Preview token request.")],
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    facade: Annotated[ProjectRuntimeDeliveryFacade, Depends(get_project_runtime_delivery_facade)],
) -> ResponseModel[SitePreviewTokenOut]:
    data, runtime_context = await facade.create_project_preview_token(
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
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
