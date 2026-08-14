from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status

from src.common.types.public_uuid import PublicUUID
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.concept_repository import (
    DesignSystemConceptGenerationRepository,
)
from src.modules.projects.design_systems.concept_schema import (
    DesignSystemConceptGenerationCancelRequest,
    DesignSystemConceptGenerationCreateRequest,
    DesignSystemConceptGenerationFeedbackRequest,
    DesignSystemConceptGenerationOut,
    DesignSystemConceptGenerationRecoveryOut,
)
from src.modules.projects.design_systems.concept_service import (
    DesignSystemConceptGenerationService,
)
from src.modules.projects.design_systems.impact_service import ProjectDesignSystemImpactService
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.schema import (
    ProjectDesignSystemAssignmentOut,
    ProjectDesignSystemAssignmentResultOut,
    ProjectDesignSystemAssignmentSetRequest,
    ProjectDesignSystemComparisonOut,
    ProjectDesignSystemComparisonRequest,
    ProjectDesignSystemForkOut,
    ProjectDesignSystemForkRequest,
    ProjectDesignSystemImpactPreviewOut,
    ProjectDesignSystemImpactPreviewRequest,
    ProjectDesignSystemSupersessionOut,
    ProjectDesignSystemSupersessionRequest,
    ProjectDesignSystemVersionPageOut,
)
from src.modules.projects.design_systems.service import ProjectDesignSystemsService
from src.modules.projects.design_systems.supersession_service import (
    ProjectDesignSystemSupersessionService,
)
from src.modules.projects.design_systems.version_service import ProjectDesignSystemVersionService
from src.modules.projects.http.router_helpers import require_project_permission
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.tenancy.context import require_current_tenant_context
from src.modules.workspaces.design_systems.schema import (
    DesignSystemValidationCreateRequest,
    DesignSystemValidationResultOut,
    DesignSystemVersionCreateRequest,
    DesignSystemVersionDetailOut,
)

router = APIRouter(
    prefix="/projects/{project_id}/design-system",
    tags=["domain.projects.design-systems"],
)

ProjectContext = Annotated[ProjectRequestContext, Depends(get_project_context)]
ActorUserId = Annotated[UUID, Depends(get_current_user_id)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]


def get_project_design_systems_service(_ctx: ProjectContext) -> ProjectDesignSystemsService:
    return ProjectDesignSystemsService(
        repository=ProjectDesignSystemsRepository(require_current_tenant_context()),
    )


Service = Annotated[ProjectDesignSystemsService, Depends(get_project_design_systems_service)]


def get_project_design_system_version_service(_ctx: ProjectContext) -> ProjectDesignSystemVersionService:
    return ProjectDesignSystemVersionService(
        repository=ProjectDesignSystemsRepository(require_current_tenant_context()),
        component_catalog_resolver=get_official_component_catalog_registry(),
    )


VersionService = Annotated[
    ProjectDesignSystemVersionService,
    Depends(get_project_design_system_version_service),
]


def get_project_design_system_impact_service(_ctx: ProjectContext) -> ProjectDesignSystemImpactService:
    tenant_context = require_current_tenant_context()
    return ProjectDesignSystemImpactService(
        repository=ProjectDesignSystemsRepository(tenant_context),
        builder_repository=SiteBuilderRepository(tenant_context),
    )


ImpactService = Annotated[
    ProjectDesignSystemImpactService,
    Depends(get_project_design_system_impact_service),
]


def get_project_design_system_supersession_service(
    _ctx: ProjectContext,
) -> ProjectDesignSystemSupersessionService:
    return ProjectDesignSystemSupersessionService(
        repository=ProjectDesignSystemsRepository(require_current_tenant_context()),
    )


SupersessionService = Annotated[
    ProjectDesignSystemSupersessionService,
    Depends(get_project_design_system_supersession_service),
]


def get_design_system_concept_generation_service(
    _ctx: ProjectContext,
) -> DesignSystemConceptGenerationService:
    tenant_context = require_current_tenant_context()
    return DesignSystemConceptGenerationService(
        repository=DesignSystemConceptGenerationRepository(tenant_context),
        design_system_repository=ProjectDesignSystemsRepository(tenant_context),
        builder_repository=SiteBuilderRepository(tenant_context),
    )


ConceptGenerationService = Annotated[
    DesignSystemConceptGenerationService,
    Depends(get_design_system_concept_generation_service),
]


@router.get(
    "/assignment",
    response_model=ResponseModel[ProjectDesignSystemAssignmentOut | None],
    dependencies=[require_project_permission("project:site:read")],
    summary="Get the exact Project Design System assignment",
)
async def get_project_design_system_assignment(
    ctx: ProjectContext,
    service: Service,
) -> ResponseModel[ProjectDesignSystemAssignmentOut | None]:
    return ApiResponse.success(data=await service.get_assignment(project_id=ctx.project_id))


@router.put(
    "/assignment",
    response_model=ResponseModel[ProjectDesignSystemAssignmentResultOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Pin an exact Design System version to a Project",
)
async def set_project_design_system_assignment(
    payload: ProjectDesignSystemAssignmentSetRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: Service,
) -> ResponseModel[ProjectDesignSystemAssignmentResultOut]:
    data = await service.set_assignment(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/forks",
    response_model=ResponseModel[ProjectDesignSystemForkOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Fork an exact Design System version for a Project",
)
async def fork_project_design_system(
    payload: ProjectDesignSystemForkRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: Service,
) -> ResponseModel[ProjectDesignSystemForkOut]:
    data = await service.fork(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{system_id}/versions",
    response_model=ResponseModel[ProjectDesignSystemVersionPageOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="List immutable Project Design System versions",
)
async def list_project_design_system_versions(
    system_id: PublicUUID,
    ctx: ProjectContext,
    service: VersionService,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
) -> ResponseModel[ProjectDesignSystemVersionPageOut]:
    data = await service.list_versions(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        system_id=system_id,
        limit=limit,
        cursor=cursor,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/comparisons",
    response_model=ResponseModel[ProjectDesignSystemComparisonOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="Compare two immutable Project Design System versions",
)
async def compare_project_design_system_versions(
    system_id: PublicUUID,
    payload: ProjectDesignSystemComparisonRequest,
    ctx: ProjectContext,
    service: VersionService,
) -> ResponseModel[ProjectDesignSystemComparisonOut]:
    data = await service.compare_versions(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        system_id=system_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/impact-previews",
    response_model=ResponseModel[ProjectDesignSystemImpactPreviewOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="Preview exact Project Design System downstream impact",
)
async def preview_project_design_system_impact(
    system_id: PublicUUID,
    payload: ProjectDesignSystemImpactPreviewRequest,
    ctx: ProjectContext,
    service: ImpactService,
) -> ResponseModel[ProjectDesignSystemImpactPreviewOut]:
    data = await service.preview(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        system_id=system_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{system_id}/versions/{version_id}",
    response_model=ResponseModel[DesignSystemVersionDetailOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="Get an immutable Project Design System version",
)
async def get_project_design_system_version(
    system_id: PublicUUID,
    version_id: PublicUUID,
    ctx: ProjectContext,
    service: VersionService,
) -> ResponseModel[DesignSystemVersionDetailOut]:
    data = await service.get_version(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        system_id=system_id,
        version_id=version_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/versions",
    response_model=ResponseModel[DesignSystemVersionDetailOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Create an immutable Project Design System version",
)
async def create_project_design_system_version(
    system_id: PublicUUID,
    payload: DesignSystemVersionCreateRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: VersionService,
) -> ResponseModel[DesignSystemVersionDetailOut]:
    data = await service.create_version(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        project_id=ctx.project_id,
        system_id=system_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/versions/{version_id}/validations",
    response_model=ResponseModel[DesignSystemValidationResultOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Validate an exact Project Design System foundation",
)
async def create_project_design_system_validation(
    system_id: PublicUUID,
    version_id: PublicUUID,
    payload: DesignSystemValidationCreateRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: VersionService,
) -> ResponseModel[DesignSystemValidationResultOut]:
    data = await service.create_validation(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        project_id=ctx.project_id,
        system_id=system_id,
        version_id=version_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/concept-generations",
    response_model=ResponseModel[DesignSystemConceptGenerationOut],
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Start durable Agent Style Guide concept generation",
)
async def create_project_design_system_concept_generation(
    system_id: PublicUUID,
    payload: DesignSystemConceptGenerationCreateRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: ConceptGenerationService,
) -> ResponseModel[DesignSystemConceptGenerationOut]:
    data = await service.create(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        design_system_id=UUID(str(system_id)),
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{system_id}/concept-generations/recovery",
    response_model=ResponseModel[DesignSystemConceptGenerationRecoveryOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="Recover active and latest terminal Agent Style Guide concept generations",
)
async def recover_project_design_system_concept_generations(
    system_id: PublicUUID,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: ConceptGenerationService,
) -> ResponseModel[DesignSystemConceptGenerationRecoveryOut]:
    data = await service.recover(
        project_id=ctx.project_id,
        design_system_id=UUID(str(system_id)),
        actor_user_id=actor_user_id,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{system_id}/concept-generations/{generation_id}",
    response_model=ResponseModel[DesignSystemConceptGenerationOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="Get durable Agent Style Guide concept generation",
)
async def get_project_design_system_concept_generation(
    system_id: PublicUUID,
    generation_id: PublicUUID,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: ConceptGenerationService,
) -> ResponseModel[DesignSystemConceptGenerationOut]:
    data = await service.get(
        project_id=ctx.project_id,
        design_system_id=UUID(str(system_id)),
        actor_user_id=actor_user_id,
        generation_id=UUID(str(generation_id)),
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/concept-generations/{generation_id}/cancel",
    response_model=ResponseModel[DesignSystemConceptGenerationOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Request cooperative cancellation of Agent Style Guide concept generation",
)
async def cancel_project_design_system_concept_generation(
    system_id: PublicUUID,
    generation_id: PublicUUID,
    payload: DesignSystemConceptGenerationCancelRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: ConceptGenerationService,
) -> ResponseModel[DesignSystemConceptGenerationOut]:
    data = await service.cancel(
        project_id=ctx.project_id,
        design_system_id=UUID(str(system_id)),
        actor_user_id=actor_user_id,
        generation_id=UUID(str(generation_id)),
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/concept-generations/{generation_id}/feedback",
    response_model=ResponseModel[DesignSystemConceptGenerationOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Attach reviewer feedback to one Agent Style Guide concept candidate",
)
async def submit_project_design_system_concept_feedback(
    system_id: PublicUUID,
    generation_id: PublicUUID,
    payload: DesignSystemConceptGenerationFeedbackRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: ConceptGenerationService,
) -> ResponseModel[DesignSystemConceptGenerationOut]:
    data = await service.submit_feedback(
        project_id=ctx.project_id,
        design_system_id=UUID(str(system_id)),
        actor_user_id=actor_user_id,
        generation_id=UUID(str(generation_id)),
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{system_id}/versions/{version_id}/supersessions",
    response_model=ResponseModel[ProjectDesignSystemSupersessionOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Supersede an immutable Project Design System version",
)
async def supersede_project_design_system_version(
    system_id: PublicUUID,
    version_id: PublicUUID,
    payload: ProjectDesignSystemSupersessionRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: SupersessionService,
) -> ResponseModel[ProjectDesignSystemSupersessionOut]:
    data = await service.supersede_version(
        workspace_id=ctx.workspace_id,
        organization_id=ctx.organization_id,
        project_id=ctx.project_id,
        system_id=system_id,
        target_version_id=version_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)
