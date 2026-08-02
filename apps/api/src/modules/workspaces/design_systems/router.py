from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.assets.admin.assets.repository import AdminAssetsRepository
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.jobs.service import BackgroundJobService
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.service import SiteBuilderService
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.tenancy.context import require_current_tenant_context
from src.modules.workspaces.authz.http.service import require_workspace_commercial_effect, require_workspace_permission
from src.modules.workspaces.design_systems.publication_assets import DesignSystemAssetPinResolver
from src.modules.workspaces.design_systems.publication_repository import DesignSystemPublicationRepository
from src.modules.workspaces.design_systems.publication_schema import (
    WorkspaceDesignSystemPublicationCreateRequest,
    WorkspaceDesignSystemPublicationOut,
)
from src.modules.workspaces.design_systems.publication_service import DesignSystemPublicationService
from src.modules.workspaces.design_systems.repository import WorkspaceDesignSystemsRepository
from src.modules.workspaces.design_systems.schema import (
    DesignSystemCreateRequest,
    DesignSystemCursorPage,
    DesignSystemDetailOut,
    DesignSystemSummaryOut,
    DesignSystemValidationCreateRequest,
    DesignSystemValidationResultOut,
    DesignSystemVersionCreateRequest,
    DesignSystemVersionDetailOut,
    DesignSystemVersionSummaryOut,
    WorkspaceDesignSystemDefaultOut,
    WorkspaceDesignSystemDefaultSetRequest,
    WorkspaceDesignSystemRepresentativePreviewOut,
    WorkspaceDesignSystemRepresentativePreviewRequest,
    WorkspaceDesignSystemsCapabilitiesOut,
)
from src.modules.workspaces.design_systems.service import (
    WorkspaceDesignSystemsService,
    workspace_design_system_capabilities,
)
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/design-systems",
    tags=["domain.workspaces.design-systems"],
)

ReadContext = Annotated[WorkspaceContext, Depends(require_workspace_manage_access)]
ActorUserId = Annotated[UUID, Depends(get_current_user_id)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]


def get_workspace_design_systems_service(_ctx: ReadContext) -> WorkspaceDesignSystemsService:
    tenant_context = require_current_tenant_context()
    component_catalog_resolver = get_official_component_catalog_registry()
    return WorkspaceDesignSystemsService(
        repository=WorkspaceDesignSystemsRepository(tenant_context),
        component_catalog_resolver=component_catalog_resolver,
        representative_preview_renderer=SiteBuilderService(
            repository=SiteBuilderRepository(tenant_context),
            design_system_repository=ProjectDesignSystemsRepository(tenant_context),
            component_catalog_resolver=component_catalog_resolver,
        ),
    )


DesignSystemsService = Annotated[
    WorkspaceDesignSystemsService,
    Depends(get_workspace_design_systems_service),
]


def get_workspace_design_system_publication_service(_ctx: ReadContext) -> DesignSystemPublicationService:
    tenant_context = require_current_tenant_context()
    return DesignSystemPublicationService(
        repository=WorkspaceDesignSystemsRepository(tenant_context),
        publications=DesignSystemPublicationRepository(tenant_context),
        assets=DesignSystemAssetPinResolver(repository=AdminAssetsRepository(tenant_context)),
        jobs=BackgroundJobService(),
    )


DesignSystemPublicationServiceDependency = Annotated[
    DesignSystemPublicationService,
    Depends(get_workspace_design_system_publication_service),
]


@router.get(
    "/capabilities",
    response_model=ResponseModel[WorkspaceDesignSystemsCapabilitiesOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get Workspace Design Systems rollout capabilities",
)
async def get_workspace_design_system_capabilities(
    _ctx: ReadContext,
) -> ResponseModel[WorkspaceDesignSystemsCapabilitiesOut]:
    return ApiResponse.success(data=workspace_design_system_capabilities())


@router.get(
    "",
    response_model=ResponseModel[DesignSystemCursorPage[DesignSystemSummaryOut]],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="List Workspace Design Systems",
)
async def list_workspace_design_systems(
    ctx: ReadContext,
    service: DesignSystemsService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=128)] = None,
) -> ResponseModel[DesignSystemCursorPage[DesignSystemSummaryOut]]:
    data = await service.list_systems(
        workspace_id=ctx.workspace_id,
        limit=limit,
        cursor=cursor,
        query=q,
    )
    return ApiResponse.success(data=data)


@router.post(
    "",
    response_model=ResponseModel[DesignSystemDetailOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        require_workspace_permission("system:settings:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Create a Workspace Design System identity",
)
async def create_workspace_design_system(
    payload: DesignSystemCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: DesignSystemsService,
) -> ResponseModel[DesignSystemDetailOut]:
    data = await service.create_system(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/default-assignment",
    response_model=ResponseModel[WorkspaceDesignSystemDefaultOut | None],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get the exact Workspace Design System default assignment",
)
async def get_workspace_design_system_default(
    ctx: ReadContext,
    service: DesignSystemsService,
) -> ResponseModel[WorkspaceDesignSystemDefaultOut | None]:
    return ApiResponse.success(data=await service.get_default(workspace_id=ctx.workspace_id))


@router.get(
    "/component-catalogs",
    response_model=ResponseModel[tuple[ComponentCatalogV1, ...]],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="List registered component catalogs available to Workspace Design Systems",
)
async def list_workspace_design_system_component_catalogs(
    _ctx: ReadContext,
    service: DesignSystemsService,
) -> ResponseModel[tuple[ComponentCatalogV1, ...]]:
    return ApiResponse.success(data=service.list_component_catalogs())


@router.put(
    "/default-assignment",
    response_model=ResponseModel[WorkspaceDesignSystemDefaultOut],
    dependencies=[
        require_workspace_permission("system:settings:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Pin the exact Workspace Design System default assignment",
)
async def set_workspace_design_system_default(
    payload: WorkspaceDesignSystemDefaultSetRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: DesignSystemsService,
) -> ResponseModel[WorkspaceDesignSystemDefaultOut]:
    data = await service.set_default(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{system_id}",
    response_model=ResponseModel[DesignSystemDetailOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get a Workspace Design System",
)
async def get_workspace_design_system(
    system_id: PublicUUID,
    ctx: ReadContext,
    service: DesignSystemsService,
) -> ResponseModel[DesignSystemDetailOut]:
    return ApiResponse.success(data=await service.get_system(workspace_id=ctx.workspace_id, system_id=system_id))


@router.get(
    "/{system_id}/versions",
    response_model=ResponseModel[DesignSystemCursorPage[DesignSystemVersionSummaryOut]],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="List immutable Workspace Design System versions",
)
async def list_workspace_design_system_versions(
    system_id: PublicUUID,
    ctx: ReadContext,
    service: DesignSystemsService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
) -> ResponseModel[DesignSystemCursorPage[DesignSystemVersionSummaryOut]]:
    data = await service.list_versions(
        workspace_id=ctx.workspace_id,
        system_id=system_id,
        limit=limit,
        cursor=cursor,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/versions",
    response_model=ResponseModel[DesignSystemVersionDetailOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        require_workspace_permission("system:settings:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Create an immutable Workspace Design System version",
)
async def create_workspace_design_system_version(
    system_id: PublicUUID,
    payload: DesignSystemVersionCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: DesignSystemsService,
) -> ResponseModel[DesignSystemVersionDetailOut]:
    data = await service.create_version(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        system_id=system_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{system_id}/versions/{version_id}",
    response_model=ResponseModel[DesignSystemVersionDetailOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Get an immutable Workspace Design System version",
)
async def get_workspace_design_system_version(
    system_id: PublicUUID,
    version_id: PublicUUID,
    ctx: ReadContext,
    service: DesignSystemsService,
) -> ResponseModel[DesignSystemVersionDetailOut]:
    data = await service.get_version(
        workspace_id=ctx.workspace_id,
        system_id=system_id,
        version_id=version_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/versions/{version_id}/validations",
    response_model=ResponseModel[DesignSystemValidationResultOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        require_workspace_permission("system:settings:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Validate an exact Workspace Design System foundation",
)
async def create_workspace_design_system_validation(
    system_id: PublicUUID,
    version_id: PublicUUID,
    payload: DesignSystemValidationCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: DesignSystemsService,
) -> ResponseModel[DesignSystemValidationResultOut]:
    data = await service.create_validation(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        system_id=system_id,
        version_id=version_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{system_id}/versions/{version_id}/validation-results",
    response_model=ResponseModel[tuple[DesignSystemValidationResultOut, ...]],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="List immutable Workspace Design System validation results",
)
async def list_workspace_design_system_validations(
    system_id: PublicUUID,
    version_id: PublicUUID,
    ctx: ReadContext,
    service: DesignSystemsService,
) -> ResponseModel[tuple[DesignSystemValidationResultOut, ...]]:
    data = await service.list_validations(
        workspace_id=ctx.workspace_id,
        system_id=system_id,
        version_id=version_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/versions/{version_id}/previews",
    response_model=ResponseModel[WorkspaceDesignSystemRepresentativePreviewOut],
    dependencies=[require_workspace_permission("system:settings:read")],
    summary="Render an exact representative Builder page for a Workspace Design System version",
)
async def preview_workspace_design_system_version(
    system_id: PublicUUID,
    version_id: PublicUUID,
    payload: WorkspaceDesignSystemRepresentativePreviewRequest,
    response: Response,
    ctx: ReadContext,
    service: DesignSystemsService,
) -> ResponseModel[WorkspaceDesignSystemRepresentativePreviewOut]:
    response.headers["Cache-Control"] = "private, no-store"
    data = await service.preview_representative(
        workspace_id=ctx.workspace_id,
        system_id=system_id,
        version_id=version_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/versions/{version_id}/publications",
    response_model=ResponseModel[WorkspaceDesignSystemPublicationOut],
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[
        require_workspace_permission("system:site:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT),
    ],
    summary="Queue durable compilation and publication for one exact Workspace Design System version",
)
async def request_workspace_design_system_publication(
    system_id: PublicUUID,
    version_id: PublicUUID,
    payload: WorkspaceDesignSystemPublicationCreateRequest,
    ctx: ReadContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: DesignSystemPublicationServiceDependency,
) -> ResponseModel[WorkspaceDesignSystemPublicationOut]:
    data = await service.request_publication(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        system_id=system_id,
        version_id=version_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)
