from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.models.knowledge._enums import (
    KnowledgeBaseStatus,
    KnowledgeServingFreshness,
    KnowledgeSourceKind,
    KnowledgeSourceStatus,
)
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.jobs.service import BackgroundJobService
from src.modules.tenancy.context import require_current_tenant_context
from src.modules.workspaces.authz.http.service import require_workspace_commercial_effect, require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.modules.workspaces.knowledge.repository import WorkspaceKnowledgeRepository
from src.modules.workspaces.knowledge.schema import (
    KnowledgeBaseCreateRequest,
    KnowledgeBaseDetailOut,
    KnowledgeBaseSummaryOut,
    KnowledgeBaseUpdateRequest,
    KnowledgeCursorPage,
    KnowledgeSourceCreateRequest,
    KnowledgeSourceIngestionAcceptedOut,
    KnowledgeSourceIngestionCreateRequest,
    KnowledgeSourceOut,
    KnowledgeSourceUpdateRequest,
    KnowledgeSourceVersionOut,
    ManualKnowledgeVersionCreateRequest,
    WorkspaceKnowledgeCapabilitiesOut,
)
from src.modules.workspaces.knowledge.service import (
    WorkspaceKnowledgeService,
    workspace_knowledge_capabilities,
)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/knowledge-bases",
    tags=["domain.workspaces.knowledge"],
)

ReadContext = Annotated[WorkspaceContext, Depends(require_workspace_manage_access)]
ActorUserId = Annotated[UUID, Depends(get_current_user_id)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]


def get_workspace_knowledge_service(
    _ctx: ReadContext,
) -> WorkspaceKnowledgeService:
    return WorkspaceKnowledgeService(
        repository=WorkspaceKnowledgeRepository(require_current_tenant_context()),
        jobs=BackgroundJobService(),
    )


KnowledgeService = Annotated[WorkspaceKnowledgeService, Depends(get_workspace_knowledge_service)]


@router.get(
    "/capabilities",
    response_model=ResponseModel[WorkspaceKnowledgeCapabilitiesOut],
    dependencies=[require_workspace_permission("system:content:read")],
    summary="Get Workspace Knowledge rollout capabilities",
)
async def get_workspace_knowledge_capabilities(
    _ctx: ReadContext,
    service: KnowledgeService,
) -> ResponseModel[WorkspaceKnowledgeCapabilitiesOut]:
    return ApiResponse.success(data=workspace_knowledge_capabilities(service.settings))


@router.get(
    "",
    response_model=ResponseModel[KnowledgeCursorPage[KnowledgeBaseSummaryOut]],
    dependencies=[require_workspace_permission("system:content:read")],
    summary="List Workspace Knowledge bases",
)
async def list_knowledge_bases(
    ctx: ReadContext,
    service: KnowledgeService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=128)] = None,
    status_filter: Annotated[KnowledgeBaseStatus | None, Query(alias="status")] = None,
    locale: Annotated[str | None, Query(min_length=2, max_length=32)] = None,
) -> ResponseModel[KnowledgeCursorPage[KnowledgeBaseSummaryOut]]:
    data = await service.list_bases(
        workspace_id=ctx.workspace_id,
        limit=limit,
        cursor=cursor,
        query=q,
        status=str(status_filter) if status_filter is not None else None,
        locale=locale,
    )
    return ApiResponse.success(data=data)


@router.post(
    "",
    response_model=ResponseModel[KnowledgeBaseDetailOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Create a Workspace Knowledge base",
)
async def create_knowledge_base(
    payload: KnowledgeBaseCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: KnowledgeService,
) -> ResponseModel[KnowledgeBaseDetailOut]:
    data = await service.create_base(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{base_id}",
    response_model=ResponseModel[KnowledgeBaseDetailOut],
    dependencies=[require_workspace_permission("system:content:read")],
    summary="Get a Workspace Knowledge base",
)
async def get_knowledge_base(
    base_id: PublicUUID,
    ctx: ReadContext,
    service: KnowledgeService,
) -> ResponseModel[KnowledgeBaseDetailOut]:
    data = await service.get_base(workspace_id=ctx.workspace_id, knowledge_base_id=base_id)
    return ApiResponse.success(data=data)


@router.patch(
    "/{base_id}",
    response_model=ResponseModel[KnowledgeBaseDetailOut],
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Update Workspace Knowledge metadata or access policy",
)
async def update_knowledge_base(
    base_id: PublicUUID,
    payload: KnowledgeBaseUpdateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    service: KnowledgeService,
) -> ResponseModel[KnowledgeBaseDetailOut]:
    data = await service.update_base(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        knowledge_base_id=base_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{base_id}/sources",
    response_model=ResponseModel[KnowledgeCursorPage[KnowledgeSourceOut]],
    dependencies=[require_workspace_permission("system:content:read")],
    summary="List Knowledge sources",
)
async def list_knowledge_sources(
    base_id: PublicUUID,
    ctx: ReadContext,
    service: KnowledgeService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
    kind: Annotated[KnowledgeSourceKind | None, Query()] = None,
    status_filter: Annotated[KnowledgeSourceStatus | None, Query(alias="status")] = None,
    freshness: Annotated[KnowledgeServingFreshness | None, Query()] = None,
) -> ResponseModel[KnowledgeCursorPage[KnowledgeSourceOut]]:
    data = await service.list_sources(
        workspace_id=ctx.workspace_id,
        knowledge_base_id=base_id,
        limit=limit,
        cursor=cursor,
        kind=str(kind) if kind is not None else None,
        status=str(status_filter) if status_filter is not None else None,
        freshness=str(freshness) if freshness is not None else None,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{base_id}/sources",
    response_model=ResponseModel[KnowledgeSourceOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Create a Knowledge source",
)
async def create_knowledge_source(
    base_id: PublicUUID,
    payload: KnowledgeSourceCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: KnowledgeService,
) -> ResponseModel[KnowledgeSourceOut]:
    data = await service.create_source(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        knowledge_base_id=base_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{base_id}/sources/{source_id}",
    response_model=ResponseModel[KnowledgeSourceOut],
    dependencies=[require_workspace_permission("system:content:read")],
    summary="Get a Knowledge source",
)
async def get_knowledge_source(
    base_id: PublicUUID,
    source_id: PublicUUID,
    ctx: ReadContext,
    service: KnowledgeService,
) -> ResponseModel[KnowledgeSourceOut]:
    data = await service.get_source(
        workspace_id=ctx.workspace_id,
        knowledge_base_id=base_id,
        source_id=source_id,
    )
    return ApiResponse.success(data=data)


@router.patch(
    "/{base_id}/sources/{source_id}",
    response_model=ResponseModel[KnowledgeSourceOut],
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Update Knowledge source metadata or enabled state",
)
async def update_knowledge_source(
    base_id: PublicUUID,
    source_id: PublicUUID,
    payload: KnowledgeSourceUpdateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    service: KnowledgeService,
) -> ResponseModel[KnowledgeSourceOut]:
    data = await service.update_source(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        knowledge_base_id=base_id,
        source_id=source_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{base_id}/sources/{source_id}/ingestions",
    response_model=ResponseModel[KnowledgeSourceIngestionAcceptedOut],
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT),
    ],
    summary="Queue a durable Knowledge source ingestion",
)
async def create_knowledge_source_ingestion(
    base_id: PublicUUID,
    source_id: PublicUUID,
    payload: KnowledgeSourceIngestionCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: KnowledgeService,
) -> ResponseModel[KnowledgeSourceIngestionAcceptedOut]:
    data = await service.create_source_ingestion(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        knowledge_base_id=base_id,
        source_id=source_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{base_id}/sources/{source_id}/versions",
    response_model=ResponseModel[KnowledgeCursorPage[KnowledgeSourceVersionOut]],
    dependencies=[require_workspace_permission("system:content:read")],
    summary="List immutable Knowledge source versions",
)
async def list_knowledge_source_versions(
    base_id: PublicUUID,
    source_id: PublicUUID,
    ctx: ReadContext,
    service: KnowledgeService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
) -> ResponseModel[KnowledgeCursorPage[KnowledgeSourceVersionOut]]:
    data = await service.list_versions(
        workspace_id=ctx.workspace_id,
        knowledge_base_id=base_id,
        source_id=source_id,
        limit=limit,
        cursor=cursor,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{base_id}/sources/{source_id}/versions",
    response_model=ResponseModel[KnowledgeSourceVersionOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Create an immutable manual Knowledge source version",
)
async def create_manual_knowledge_source_version(
    base_id: PublicUUID,
    source_id: PublicUUID,
    payload: ManualKnowledgeVersionCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: KnowledgeService,
) -> ResponseModel[KnowledgeSourceVersionOut]:
    data = await service.create_manual_version(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        knowledge_base_id=base_id,
        source_id=source_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{base_id}/sources/{source_id}/versions/{version_id}",
    response_model=ResponseModel[KnowledgeSourceVersionOut],
    dependencies=[require_workspace_permission("system:content:read")],
    summary="Get an immutable Knowledge source version",
)
async def get_knowledge_source_version(
    base_id: PublicUUID,
    source_id: PublicUUID,
    version_id: PublicUUID,
    ctx: ReadContext,
    service: KnowledgeService,
) -> ResponseModel[KnowledgeSourceVersionOut]:
    data = await service.get_version(
        workspace_id=ctx.workspace_id,
        knowledge_base_id=base_id,
        source_id=source_id,
        version_id=version_id,
    )
    return ApiResponse.success(data=data)
