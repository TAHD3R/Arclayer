from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, status

from src.common.types.public_uuid import PublicUUID
from src.core.events import EventBus
from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.content.contracts.schema import (
    ContentModelDefinitionContract,
    ContentModelImpactPreviewOut,
    ContentModelOut,
)
from src.modules.projects.content.models.canonical_service import (
    ContentModelDefinitionPatchContract,
    ProjectContentCanonicalModelsService,
)
from src.modules.projects.content.models.router_helpers import (
    ContentModelMutationOut,
    get_event_bus,
    get_project_content_canonical_models_service,
    publish_content_model_activity_event,
    to_mutation_out,
    to_preview_out,
)
from src.modules.projects.content.shared.router import (
    ProjectContentRouteContext,
    require_project_content_manage_context,
    require_project_content_read_context,
)

router = APIRouter(
    prefix="/projects/{project_id}/content",
    tags=["domain.projects.content"],
)


@router.post(
    "/models",
    response_model=ResponseModel[ContentModelMutationOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create rebuilt content model contract (project RBAC protected)",
)
async def create_project_content_model(
    payload: Annotated[ContentModelDefinitionContract, Body(description="Create model contract payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    service: Annotated[
        ProjectContentCanonicalModelsService,
        Depends(get_project_content_canonical_models_service),
    ],
) -> ResponseModel[ContentModelMutationOut]:
    record = await service.create_model(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        payload=payload,
    )
    return ApiResponse.success(data=to_mutation_out(record))


@router.get(
    "/models",
    response_model=ResponseModel[PageData[ContentModelOut]],
    response_model_exclude_none=True,
    summary="List rebuilt content models (project RBAC protected)",
)
async def list_project_content_models(
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        ProjectContentCanonicalModelsService,
        Depends(get_project_content_canonical_models_service),
    ],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentModelOut]]:
    data = await service.list_models_paginated(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        params=params,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/models/{model_id}/impact-preview",
    response_model=ResponseModel[ContentModelImpactPreviewOut],
    response_model_exclude_none=True,
    summary="Preview rebuilt content model mutation impact (project RBAC protected)",
)
async def preview_project_content_model_update(
    model_id: PublicUUID,
    payload: Annotated[ContentModelDefinitionPatchContract, Body(description="Patch model contract payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    service: Annotated[
        ProjectContentCanonicalModelsService,
        Depends(get_project_content_canonical_models_service),
    ],
) -> ResponseModel[ContentModelImpactPreviewOut]:
    result = await service.preview_model_update(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        model_id=model_id,
        payload=payload,
    )
    if result is None:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
    return ApiResponse.success(data=to_preview_out(result))


@router.patch(
    "/models/{model_id}",
    response_model=ResponseModel[ContentModelMutationOut],
    response_model_exclude_none=True,
    summary="Update rebuilt content model contract (project RBAC protected)",
)
async def update_project_content_model(
    model_id: PublicUUID,
    payload: Annotated[ContentModelDefinitionPatchContract, Body(description="Patch model contract payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID | None, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        ProjectContentCanonicalModelsService,
        Depends(get_project_content_canonical_models_service),
    ],
) -> ResponseModel[ContentModelMutationOut]:
    record = await service.update_model(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        model_id=model_id,
        payload=payload,
    )
    if record is None:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
    await publish_content_model_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx.workspace_ctx,
        entity_id=UUID(str(record.record.id)),
        event_bus=event_bus,
        result=record,
    )
    return ApiResponse.success(data=to_mutation_out(record))
