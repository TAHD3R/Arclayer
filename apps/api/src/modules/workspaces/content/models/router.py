from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, status

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.exceptions import NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.content.contracts.schema import (
    ContentModelDefinitionContract,
    ContentModelImpactOut,
    ContentModelOut,
)
from apps.api.src.modules.workspaces.content.models.canonical_service import (
    ContentModelDefinitionPatchContract,
    ContentModelMutationResult,
    WorkspaceContentCanonicalModelsService,
)
from apps.api.src.modules.workspaces.content.models.repository import WorkspaceContentModelsRepository
from apps.api.src.modules.workspaces.content.shared.router import _resolve_site_id
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

canonical_models_router = APIRouter(
    prefix="/workspaces/{workspace_id}/content",
    tags=["Workspace: Content"],
    dependencies=[require_workspace_permission("system:content:read")],
)


class ContentModelMutationOut(BaseSchema):
    id: PublicUUID
    workspace_id: PublicUUID
    site_id: PublicUUID
    key: str
    name: str
    description: str | None = None
    impact: ContentModelImpactOut


def _to_mutation_out(result: ContentModelMutationResult) -> ContentModelMutationOut:
    record = result.record
    return ContentModelMutationOut(
        id=UUID(str(record.id)),
        workspace_id=UUID(str(record.workspace_id)),
        site_id=UUID(str(record.site_id)),
        key=str(record.key),
        name=str(record.name),
        description=record.description,
        impact=result.impact,
    )


def get_workspace_content_canonical_models_service() -> WorkspaceContentCanonicalModelsService:
    return WorkspaceContentCanonicalModelsService(repo=WorkspaceContentModelsRepository())


@canonical_models_router.post(
    "/models",
    response_model=ResponseModel[ContentModelMutationOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create rebuilt content model contract (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def create_workspace_content_model(
    payload: Annotated[ContentModelDefinitionContract, Body(description="Create model contract payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalModelsService,
        Depends(get_workspace_content_canonical_models_service),
    ],
) -> ResponseModel[ContentModelMutationOut]:
    record = await service.create_model(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        payload=payload,
    )
    return Response.success(data=_to_mutation_out(record))


@canonical_models_router.get(
    "/models",
    response_model=ResponseModel[PageData[ContentModelOut]],
    response_model_exclude_none=True,
    summary="List rebuilt content models (workspace RBAC protected)",
)
async def list_workspace_content_models_canonical(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalModelsService,
        Depends(get_workspace_content_canonical_models_service),
    ],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentModelOut]]:
    data = await service.list_models_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
    )
    return Response.success(data=data)


@canonical_models_router.patch(
    "/models/{model_id}",
    response_model=ResponseModel[ContentModelMutationOut],
    response_model_exclude_none=True,
    summary="Update rebuilt content model contract (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def update_workspace_content_model(
    model_id: PublicUUID,
    payload: Annotated[ContentModelDefinitionPatchContract, Body(description="Patch model contract payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalModelsService,
        Depends(get_workspace_content_canonical_models_service),
    ],
) -> ResponseModel[ContentModelMutationOut]:
    record = await service.update_model(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        model_id=model_id,
        payload=payload,
    )
    if record is None:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
    return Response.success(data=_to_mutation_out(record))
