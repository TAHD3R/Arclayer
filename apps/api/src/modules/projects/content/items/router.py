from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, status

from src.common.types.public_uuid import PublicUUID
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.models.content._enums import ContentVersionState
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.content.contracts.schema import (
    ContentItemBulkTransitionOut,
    ContentItemOut,
    ContentTranslationGroupOut,
    ContentVersionCompareOut,
    ContentVersionOut,
)
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.input_schema import (
    ContentItemBootstrapShapeIn,
    ContentItemBulkTransitionIn,
    ContentItemCreateIn,
    ContentItemWorkflowPatchIn,
    ContentTranslationCreateIn,
    ContentVersionDraftSaveIn,
    ContentVersionPatchIn,
)
from src.modules.projects.content.items.read_service import ProjectContentCanonicalItemReadService
from src.modules.projects.content.items.router_helpers import (
    get_project_content_canonical_item_reads,
    get_project_content_canonical_items_service,
)
from src.modules.projects.content.shared.router import (
    ProjectContentRouteContext,
    require_project_content_manage_context,
    require_project_content_publish_context,
    require_project_content_read_context,
)
from src.modules.sites.search.deps import get_content_search_service
from src.modules.sites.search.service import ContentSearchService

router = APIRouter(
    prefix="/projects/{project_id}/content",
    tags=["domain.projects.content"],
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
        ProjectContentCanonicalItemReadService,
        Depends(get_project_content_canonical_item_reads),
    ],
    params: PageParams = Depends(get_page_params),
    model_key: Annotated[str | None, Query(alias="modelKey", description="Optional content model key filter.")] = None,
) -> ResponseModel[PageData[ContentItemOut]]:
    data = await service.list_items_paginated(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        params=params,
        model_key=model_key,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items/bulk/publish",
    response_model=ResponseModel[ContentItemBulkTransitionOut],
    response_model_exclude_none=True,
    summary="Bulk publish rebuilt content items (project RBAC protected)",
)
async def bulk_publish_project_content_items(
    payload: Annotated[ContentItemBulkTransitionIn, Body(description="Bulk content item publish payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_publish_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
    search_service: Annotated[ContentSearchService, Depends(get_content_search_service)],
) -> ResponseModel[ContentItemBulkTransitionOut]:
    data = await service.bulk_publish_items(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_ids=payload.item_ids,
        actor_user_id=actor_user_id,
    )
    if search_service.enabled:
        await search_service.reindex_runtime(runtime_context=ctx.runtime_ctx)
    return ApiResponse.success(data=data)


@router.post(
    "/items/bulk/unpublish",
    response_model=ResponseModel[ContentItemBulkTransitionOut],
    response_model_exclude_none=True,
    summary="Bulk unpublish rebuilt content items (project RBAC protected)",
)
async def bulk_unpublish_project_content_items(
    payload: Annotated[ContentItemBulkTransitionIn, Body(description="Bulk content item unpublish payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_publish_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
    search_service: Annotated[ContentSearchService, Depends(get_content_search_service)],
) -> ResponseModel[ContentItemBulkTransitionOut]:
    data = await service.bulk_unpublish_items(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_ids=payload.item_ids,
        actor_user_id=actor_user_id,
    )
    if search_service.enabled:
        await search_service.remove_items(
            runtime_context=ctx.runtime_ctx,
            item_ids=(item.item_id for item in data.items),
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
        ProjectContentCanonicalItemReadService,
        Depends(get_project_content_canonical_item_reads),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.get_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.create_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        environment_id=ctx.environment_id,
        actor_user_id=actor_user_id,
        payload=payload,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.duplicate_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/items/{item_id}/translations",
    response_model=ResponseModel[ContentTranslationGroupOut],
    response_model_exclude_none=True,
    summary="List content item translations (project RBAC protected)",
)
async def list_project_content_item_translations(
    item_id: PublicUUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentTranslationGroupOut]:
    """List translations linked to one content item."""
    data = await service.list_translations(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items/{item_id}/translations",
    response_model=ResponseModel[ContentItemOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create content item translation (project RBAC protected)",
)
async def create_project_content_item_translation(
    item_id: PublicUUID,
    payload: Annotated[ContentTranslationCreateIn, Body(description="Create translation payload.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    """Create a translated item in another locale."""
    data = await service.create_translation(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/items/{item_id}/translation-group",
    response_model=ResponseModel[ContentTranslationGroupOut],
    response_model_exclude_none=True,
    summary="Get content item translation group (project RBAC protected)",
)
async def get_project_content_item_translation_group(
    item_id: PublicUUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentTranslationGroupOut]:
    """Get the translation group for one content item."""
    data = await service.get_translation_group(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
    search_service: Annotated[ContentSearchService, Depends(get_content_search_service)],
) -> ResponseModel[None]:
    await service.delete_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
    )
    if search_service.enabled:
        await search_service.remove_items(runtime_context=ctx.runtime_ctx, item_ids=[item_id])
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.archive_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.unarchive_item(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.apply_bootstrap_shape(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentItemOut]:
    data = await service.patch_workflow(
        project_id=ctx.project_id,
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        runtime_id=ctx.runtime_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.save_draft_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        actor_user_id=actor_user_id,
        payload=payload,
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
        ProjectContentCanonicalItemReadService,
        Depends(get_project_content_canonical_item_reads),
    ],
    params: PageParams = Depends(get_page_params),
) -> ResponseModel[PageData[ContentVersionOut]]:
    data = await service.list_versions_paginated(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
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
        ProjectContentCanonicalItemReadService,
        Depends(get_project_content_canonical_item_reads),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.get_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        version_number=version_number,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/items/{item_id}/versions/{version_number}/compare/{target_version_number}",
    response_model=ResponseModel[ContentVersionCompareOut],
    response_model_exclude_none=True,
    summary="Compare rebuilt content versions (project RBAC protected)",
)
async def compare_project_content_item_versions(
    item_id: PublicUUID,
    version_number: int,
    target_version_number: int,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionCompareOut]:
    data = await service.compare_versions(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        source_version_number=version_number,
        target_version_number=target_version_number,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/items/{item_id}/versions/{version_number}/restore",
    response_model=ResponseModel[ContentVersionOut],
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Restore rebuilt content version into a draft (project RBAC protected)",
)
async def restore_project_content_item_version(
    item_id: PublicUUID,
    version_number: int,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.restore_version_to_draft(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        version_number=version_number,
        actor_user_id=actor_user_id,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
    search_service: Annotated[ContentSearchService, Depends(get_content_search_service)],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.PUBLISHED,
        actor_user_id=actor_user_id,
    )
    if search_service.enabled:
        await search_service.reindex_runtime(runtime_context=ctx.runtime_ctx)
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.SCHEDULED,
        actor_user_id=actor_user_id,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.transition_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        version_number=version_number,
        target_state=ContentVersionState.ARCHIVED,
        actor_user_id=actor_user_id,
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
    service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
) -> ResponseModel[ContentVersionOut]:
    data = await service.patch_version(
        workspace_id=ctx.workspace_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        item_id=item_id,
        version_number=version_number,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)
