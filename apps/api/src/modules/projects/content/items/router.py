from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, status

from src.common.types.public_uuid import PublicUUID
from src.core.events import EventBus
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.models.content._enums import ContentVersionState
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.content.shared.router import (
    ProjectContentRouteContext,
    require_project_content_manage_context,
    require_project_content_publish_context,
    require_project_content_read_context,
)
from src.modules.workspaces.content.contracts.schema import ContentItemOut, ContentVersionOut
from src.modules.workspaces.content.items.canonical_service import WorkspaceContentCanonicalItemsService
from src.modules.workspaces.content.items.input_schema import (
    ContentItemBootstrapShapeIn,
    ContentItemCreateIn,
    ContentItemWorkflowPatchIn,
    ContentVersionDraftSaveIn,
    ContentVersionPatchIn,
)
from src.modules.workspaces.content.items.read_service import WorkspaceContentCanonicalItemReadService
from src.modules.workspaces.content.items.router import (
    _publish_content_activity_event,
    get_event_bus,
    get_workspace_content_canonical_item_reads,
    get_workspace_content_canonical_items_service,
)

router = APIRouter(
    prefix="/projects/{project_id}/content",
    tags=["domain.projects.content"],
)


async def _publish_project_content_activity_event(
    *,
    actor_user_id: UUID | None,
    ctx: ProjectContentRouteContext,
    entity_id: UUID,
    entity_type: str,
    event_bus: EventBus,
    event_name: str,
    properties: dict[str, object | None] | None = None,
) -> None:
    await _publish_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx.workspace_ctx,
        entity_id=entity_id,
        entity_type=entity_type,
        event_bus=event_bus,
        event_name=event_name,
        properties={
            "project_id": str(ctx.project_id),
            "runtime_id": str(ctx.runtime_id),
            "site_id": str(ctx.site_id),
            **(properties or {}),
        },
    )


@router.get(
    "/items",
    response_model=ResponseModel[PageData[ContentItemOut]],
    response_model_exclude_none=True,
    summary="List rebuilt content items (project RBAC protected)",
)
async def list_project_content_items(
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_canonical_item_reads),
    ],
    params: PageParams = Depends(get_page_params),
    model_key: Annotated[str | None, Query(alias="modelKey", description="Optional content model key filter.")] = None,
) -> ResponseModel[PageData[ContentItemOut]]:
    data = await service.list_items_paginated(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        params=params,
        model_key=model_key,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/items/{item_id}",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Get rebuilt content item detail (project RBAC protected)",
)
async def get_project_content_item(
    item_id: PublicUUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_canonical_item_reads),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.get_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create rebuilt content item (project RBAC protected)",
)
async def create_project_content_item(
    payload: Annotated[ContentItemCreateIn, Body(description="Create content item payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.create_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=data.id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.created",
        properties={
            "item_title": data.title,
            "item_slug": data.slug,
            "item_status": str(data.status),
        },
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items/{item_id}/duplicate",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Duplicate rebuilt content item (project RBAC protected)",
)
async def duplicate_project_content_item(
    item_id: PublicUUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.duplicate_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=item_id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.duplicated",
        properties={
            "duplicated_item_id": str(data.id),
            "duplicated_item_title": data.title,
            "duplicated_item_slug": data.slug,
        },
    )
    return ApiResponse.success(data=data)


@router.delete(
    "/items/{item_id}",
    response_model=ResponseModel[None],
    summary="Delete rebuilt content item (project RBAC protected)",
)
async def delete_project_content_item(
    item_id: PublicUUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[None]:
    await service.delete_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=item_id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.deleted",
    )
    return ApiResponse.success()


@router.post(
    "/items/{item_id}/archive",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Archive current rebuilt content item state (project RBAC protected)",
)
async def archive_project_content_item(
    item_id: PublicUUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_publish_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.archive_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=data.id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.archived",
        properties={"item_status": str(data.status)},
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items/{item_id}/unarchive",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Restore archived rebuilt content item back to draft (project RBAC protected)",
)
async def unarchive_project_content_item(
    item_id: PublicUUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_publish_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.unarchive_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=data.id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.unarchived",
        properties={"item_status": str(data.status)},
    )
    return ApiResponse.success(data=data)


@router.patch(
    "/items/{item_id}/bootstrap-shape",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Apply bootstrap shape to a content item (project RBAC protected)",
)
async def apply_project_content_item_bootstrap_shape(
    item_id: PublicUUID,
    payload: Annotated[ContentItemBootstrapShapeIn, Body(description="Bootstrap shape payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.apply_bootstrap_shape(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=data.id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.bootstrap.applied",
        properties={
            "bootstrap_preset_key": data.bootstrap_preset_key,
            "bootstrap_preset_state": str(data.bootstrap_preset_state),
        },
    )
    return ApiResponse.success(data=data)


@router.patch(
    "/items/{item_id}/workflow",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Patch editorial workflow state for a content item (project RBAC protected)",
)
async def patch_project_content_item_workflow(
    item_id: PublicUUID,
    payload: Annotated[ContentItemWorkflowPatchIn, Body(description="Workflow patch payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.patch_workflow(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=item_id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.workflow.updated",
        properties={
            "workflow_stage": str(data.workflow_stage),
            "workflow_assignee_user_id": str(data.workflow_assignee_user_id)
            if data.workflow_assignee_user_id is not None
            else None,
        },
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items/{item_id}/versions/draft",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save rebuilt content draft version (project RBAC protected)",
)
async def save_project_content_item_draft_version(
    item_id: PublicUUID,
    payload: Annotated[ContentVersionDraftSaveIn, Body(description="Draft save payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.save_draft_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=item_id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.version.saved",
        properties={
            "version_number": data.version_number,
            "version_state": str(data.state),
            "change_summary": data.change_summary,
        },
    )
    return ApiResponse.success(data=data)


@router.get(
    "/items/{item_id}/versions",
    response_model=ResponseModel[PageData[ContentVersionOut]],
    response_model_exclude_none=True,
    summary="List rebuilt content versions (project RBAC protected)",
)
async def list_project_content_item_versions(
    item_id: PublicUUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_canonical_item_reads),
    ],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentVersionOut]]:
    data = await service.list_versions_paginated(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        params=params,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/items/{item_id}/versions/{version_number}",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Get rebuilt content version detail (project RBAC protected)",
)
async def get_project_content_item_version(
    item_id: PublicUUID,
    version_number: int,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_canonical_item_reads),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.get_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        version_number=version_number,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items/{item_id}/versions/{version_number}/publish",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Publish rebuilt content version (project RBAC protected)",
)
async def publish_project_content_item_version(
    item_id: PublicUUID,
    version_number: int,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_publish_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.PUBLISHED,
        actor_user_id=actor_user_id,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=item_id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.version.published",
        properties={
            "version_number": data.version_number,
            "version_state": str(data.state),
            "change_summary": data.change_summary,
        },
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items/{item_id}/versions/{version_number}/schedule",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Schedule rebuilt content version (project RBAC protected)",
)
async def schedule_project_content_item_version(
    item_id: PublicUUID,
    version_number: int,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_publish_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.SCHEDULED,
        actor_user_id=actor_user_id,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=item_id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.version.scheduled",
        properties={
            "version_number": data.version_number,
            "version_state": str(data.state),
            "change_summary": data.change_summary,
        },
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items/{item_id}/versions/{version_number}/archive",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Archive rebuilt content version (project RBAC protected)",
)
async def archive_project_content_item_version(
    item_id: PublicUUID,
    version_number: int,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_publish_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.ARCHIVED,
        actor_user_id=actor_user_id,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=item_id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.version.archived",
        properties={
            "version_number": data.version_number,
            "version_state": str(data.state),
            "change_summary": data.change_summary,
        },
    )
    return ApiResponse.success(data=data)


@router.patch(
    "/items/{item_id}/versions/{version_number}",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Patch rebuilt content version (project RBAC protected)",
)
async def patch_project_content_item_version(
    item_id: PublicUUID,
    version_number: int,
    payload: Annotated[ContentVersionPatchIn, Body(description="Version patch payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.patch_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        item_id=item_id,
        version_number=version_number,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_project_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=item_id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.version.patched",
        properties={
            "version_number": data.version_number,
            "version_state": str(data.state),
            "change_summary": data.change_summary,
        },
    )
    return ApiResponse.success(data=data)
