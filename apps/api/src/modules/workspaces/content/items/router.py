from __future__ import annotations

import asyncio
from typing import Annotated
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Body, Depends, Query, Request, status

from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.core.events import Event, EventBus
from apps.api.src.core.exceptions import ServiceUnavailable
from apps.api.src.core.http.pagination import PageData, PageParams, get_page_params
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.models.content._enums import ContentVersionState
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.workspaces.authz.http.service import require_workspace_permission
from apps.api.src.modules.workspaces.content.contracts.schema import ContentItemOut, ContentVersionOut
from apps.api.src.modules.workspaces.content.items.canonical_service import (
    WorkspaceContentCanonicalItemsService,
)
from apps.api.src.modules.workspaces.content.items.input_schema import (
    ContentItemBootstrapShapeIn,
    ContentItemCreateIn,
    ContentVersionDraftSaveIn,
    ContentVersionPatchIn,
)
from apps.api.src.modules.workspaces.content.items.read_service import (
    WorkspaceContentCanonicalItemReadService,
)
from apps.api.src.modules.workspaces.content.items.repository import WorkspaceContentItemsRepository
from apps.api.src.modules.workspaces.content.shared.router import _resolve_site_id
from apps.api.src.modules.workspaces.http.schema import WorkspaceContext
from apps.api.src.modules.workspaces.http.service import require_workspace_manage_access

canonical_items_router = APIRouter(
    prefix="/workspaces/{workspace_id}/content",
    tags=["Workspace: Content"],
    dependencies=[require_workspace_permission("system:content:read")],
)


def get_event_bus(request: Request) -> EventBus:
    bus = getattr(request.app.state, "event_bus", None)
    if bus is None:
        raise ServiceUnavailable(
            message="事件总线不可用",
            error="EVENT_BUS_UNAVAILABLE",
        )
    return bus


def get_workspace_content_canonical_items_service() -> WorkspaceContentCanonicalItemsService:
    return WorkspaceContentCanonicalItemsService(repo=WorkspaceContentItemsRepository())


def get_workspace_content_canonical_item_reads() -> WorkspaceContentCanonicalItemReadService:
    return WorkspaceContentCanonicalItemReadService(repo=WorkspaceContentItemsRepository())


async def _publish_content_activity_event(
    *,
    actor_user_id: UUID | None,
    ctx: WorkspaceContext,
    entity_id: UUID,
    entity_type: str,
    event_bus: EventBus,
    event_name: str,
    properties: dict[str, object | None] | None = None,
) -> None:
    try:
        await event_bus.publish(
            Event(
                name=event_name,
                payload={
                    "organization_id": str(ctx.organization_id),
                    "workspace_id": str(ctx.workspace_id),
                    "entity_type": entity_type,
                    "entity_id": str(entity_id),
                    **(properties or {}),
                },
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id) if actor_user_id is not None else None,
            )
        )
    except (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        return


@canonical_items_router.get(
    "/items",
    response_model=ResponseModel[PageData[ContentItemOut]],
    response_model_exclude_none=True,
    summary="List rebuilt content items (workspace RBAC protected)",
)
async def list_workspace_content_items_canonical(
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_canonical_item_reads),
    ],
    params: PageParams = Depends(get_page_params),
    model_key: Annotated[str | None, Query(alias="modelKey", description="Optional content model key filter.")] = None,
) -> ResponseModel[PageData[ContentItemOut]]:
    data = await service.list_items_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        params=params,
        model_key=model_key,
    )
    return Response.success(data=data)


@canonical_items_router.get(
    "/items/{item_id}",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Get rebuilt content item detail (workspace RBAC protected)",
)
async def get_workspace_content_item_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_canonical_item_reads),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.get_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create rebuilt content item (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def create_workspace_content_item_canonical(
    payload: Annotated[ContentItemCreateIn, Body(description="Create content item payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.create_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_content_activity_event(
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
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/duplicate",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Duplicate rebuilt content item (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def duplicate_workspace_content_item_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.duplicate_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    await _publish_content_activity_event(
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
    return Response.success(data=data)


@canonical_items_router.delete(
    "/items/{item_id}",
    response_model=ResponseModel[None],
    summary="Delete rebuilt content item (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def delete_workspace_content_item_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[None]:
    await service.delete_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
    )
    await _publish_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=item_id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.deleted",
    )
    return Response.success()


@canonical_items_router.post(
    "/items/{item_id}/archive",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Archive current rebuilt content item state (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def archive_workspace_content_item_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.archive_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    await _publish_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=data.id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.archived",
        properties={"item_status": str(data.status)},
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/unarchive",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Restore archived rebuilt content item back to draft (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def unarchive_workspace_content_item_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.unarchive_item(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    await _publish_content_activity_event(
        actor_user_id=actor_user_id,
        ctx=ctx,
        entity_id=data.id,
        entity_type="content_item",
        event_bus=event_bus,
        event_name="workspace.content.item.unarchived",
        properties={"item_status": str(data.status)},
    )
    return Response.success(data=data)


@canonical_items_router.patch(
    "/items/{item_id}/bootstrap-shape",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    summary="Apply bootstrap shape to a content item (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def apply_workspace_content_item_bootstrap_shape(
    item_id: PublicUUID,
    payload: Annotated[
        ContentItemBootstrapShapeIn,
        Body(description="Bootstrap shape payload."),
    ],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.apply_bootstrap_shape(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_content_activity_event(
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
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/versions/draft",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Save rebuilt content draft version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def save_workspace_content_item_draft_version_canonical(
    item_id: PublicUUID,
    payload: Annotated[ContentVersionDraftSaveIn, Body(description="Draft save payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.save_draft_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_content_activity_event(
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
    return Response.success(data=data)


@canonical_items_router.get(
    "/items/{item_id}/versions",
    response_model=ResponseModel[PageData[ContentVersionOut]],
    response_model_exclude_none=True,
    summary="List rebuilt content versions (workspace RBAC protected)",
)
async def list_workspace_content_item_versions_canonical(
    item_id: PublicUUID,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_canonical_item_reads),
    ],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentVersionOut]]:
    data = await service.list_versions_paginated(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        params=params,
    )
    return Response.success(data=data)


@canonical_items_router.get(
    "/items/{item_id}/versions/{version_number}",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Get rebuilt content version detail (workspace RBAC protected)",
)
async def get_workspace_content_item_version_canonical(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[
        WorkspaceContentCanonicalItemReadService,
        Depends(get_workspace_content_canonical_item_reads),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.get_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
    )
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/versions/{version_number}/publish",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Publish rebuilt content version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def publish_workspace_content_item_version_canonical(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.PUBLISHED,
        actor_user_id=actor_user_id,
    )
    await _publish_content_activity_event(
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
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/versions/{version_number}/schedule",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Schedule rebuilt content version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def schedule_workspace_content_item_version_canonical(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.SCHEDULED,
        actor_user_id=actor_user_id,
    )
    await _publish_content_activity_event(
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
    return Response.success(data=data)


@canonical_items_router.post(
    "/items/{item_id}/versions/{version_number}/archive",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Archive rebuilt content version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:publish")],
)
async def archive_workspace_content_item_version_canonical(
    item_id: PublicUUID,
    version_number: int,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.ARCHIVED,
        actor_user_id=actor_user_id,
    )
    await _publish_content_activity_event(
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
    return Response.success(data=data)


@canonical_items_router.patch(
    "/items/{item_id}/versions/{version_number}",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    summary="Patch rebuilt content version (workspace RBAC protected)",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def patch_workspace_content_item_version_canonical(
    item_id: PublicUUID,
    version_number: int,
    payload: Annotated[ContentVersionPatchIn, Body(description="Version patch payload.")],
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    service: Annotated[
        WorkspaceContentCanonicalItemsService,
        Depends(get_workspace_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.patch_version(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        item_id=item_id,
        version_number=version_number,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await _publish_content_activity_event(
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
    return Response.success(data=data)
