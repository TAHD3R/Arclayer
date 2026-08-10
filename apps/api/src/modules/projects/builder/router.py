from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.entity_manager.manager import EntityManager
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.ai.agent_builder_context_service import AgentBuilderContextResolver
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.commerce.entitlement_repository import EntitlementRepository
from src.modules.commerce.entitlement_schema import SITE_GENERATION_ENTITLEMENT
from src.modules.commerce.entitlement_service import EntitlementService
from src.modules.commerce.service import build_commerce_service
from src.modules.commerce.workspace_entitlement_authority import WorkspaceEntitlementAuthority
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetApplyOut,
    BuilderChangeSetApplyRequest,
    BuilderChangeSetPreviewOut,
    BuilderChangeSetPreviewRequest,
)
from src.modules.projects.builder.change_set_service import SiteBuilderChangeSetService
from src.modules.projects.builder.composition_saga_repository import BuilderCompositionSagaRepository
from src.modules.projects.builder.composition_saga_schema import (
    BuilderCompositionSagaCancelRequest,
    BuilderCompositionSagaCreateRequest,
    BuilderCompositionSagaOut,
    BuilderCompositionSagaPhaseTransitionRequest,
    BuilderCompositionSagaRecoveryOut,
)
from src.modules.projects.builder.composition_saga_service import BuilderCompositionSagaService
from src.modules.projects.builder.composition_saga_transition import BuilderCompositionChildCreator
from src.modules.projects.builder.draft_checkpoint_schema import (
    BuilderDraftCheckpointOut,
    BuilderDraftCheckpointSaveIn,
)
from src.modules.projects.builder.draft_checkpoint_service import BuilderDraftCheckpointService
from src.modules.projects.builder.generation_authority import CanonicalBuilderGenerationAuthorityResolver
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import (
    BuilderGenerationCancelRequest,
    BuilderGenerationCreateRequest,
    BuilderGenerationOut,
    BuilderGenerationRecoveryOut,
    BuilderGenerationTargetV1,
)
from src.modules.projects.builder.generation_service import BuilderGenerationService
from src.modules.projects.builder.render_document_schema import BuilderPageRenderDocumentOut
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    BuilderComponentCatalogOut,
    BuilderInitializationOut,
    BuilderInitializationRequest,
    BuilderRevisionHistoryOut,
    BuilderRevisionOut,
    ProjectBuilderProjectionOut,
)
from src.modules.projects.builder.service import SiteBuilderService
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.content.items.router_helpers import require_lifecycle_dispatcher
from src.modules.projects.content.items.transaction_commands import ProjectContentItemTransactionCommands
from src.modules.projects.content.items.visual_blueprint_transaction_command import (
    ProjectContentVisualBlueprintTransactionCommand,
)
from src.modules.projects.content.items.wireframe_transaction_command import (
    ProjectContentWireframeTransactionCommand,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.http.router_helpers import (
    require_project_commercial_effect,
    require_project_permission,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.tenancy.context import require_current_tenant_context

router = APIRouter(
    prefix="/projects/{project_id}/builder",
    tags=["domain.projects.builder"],
)

ProjectContext = Annotated[ProjectRequestContext, Depends(get_project_context)]
ActorUserId = Annotated[UUID, Depends(get_current_user_id)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]


async def require_builder_generation_entitlement(
    ctx: ProjectContext,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    authority = WorkspaceEntitlementAuthority(
        billing=build_commerce_service(settings),
        entitlements=EntitlementService(settings, repository=EntitlementRepository()),
    )
    await authority.require(
        workspace_id=ctx.workspace_id,
        entitlement=SITE_GENERATION_ENTITLEMENT,
    )


def get_site_builder_service(_ctx: ProjectContext) -> SiteBuilderService:
    tenant_context = require_current_tenant_context()
    return SiteBuilderService(
        repository=SiteBuilderRepository(tenant_context),
        design_system_repository=ProjectDesignSystemsRepository(tenant_context),
        component_catalog_resolver=get_official_component_catalog_registry(),
    )


Service = Annotated[SiteBuilderService, Depends(get_site_builder_service)]


def get_builder_draft_checkpoint_service(_ctx: ProjectContext) -> BuilderDraftCheckpointService:
    return BuilderDraftCheckpointService(repository=SiteBuilderRepository(require_current_tenant_context()))


DraftCheckpointService = Annotated[
    BuilderDraftCheckpointService,
    Depends(get_builder_draft_checkpoint_service),
]


def get_site_builder_change_set_service(request: Request, _ctx: ProjectContext) -> SiteBuilderChangeSetService:
    tenant_context = require_current_tenant_context()
    content_repository = ProjectContentItemsRepository(tenant_context)
    entity_manager = EntityManager(
        items_repo=content_repository,
        lifecycle=require_lifecycle_dispatcher(request),
    )
    return SiteBuilderChangeSetService(
        repository=SiteBuilderRepository(tenant_context),
        design_system_repository=ProjectDesignSystemsRepository(tenant_context),
        component_catalog_resolver=get_official_component_catalog_registry(),
        content_commands=ProjectContentItemTransactionCommands(
            repo=content_repository,
            entity_manager=entity_manager,
            organization_id=_ctx.organization_id,
        ),
        wireframe_commands=ProjectContentWireframeTransactionCommand(
            repo=content_repository,
            entity_manager=entity_manager,
            organization_id=_ctx.organization_id,
        ),
        design_commands=ProjectContentVisualBlueprintTransactionCommand(
            repo=content_repository,
            entity_manager=entity_manager,
            organization_id=_ctx.organization_id,
        ),
    )


ChangeSetService = Annotated[
    SiteBuilderChangeSetService,
    Depends(get_site_builder_change_set_service),
]


def get_builder_generation_service(_ctx: ProjectContext) -> BuilderGenerationService:
    tenant_context = require_current_tenant_context()
    return BuilderGenerationService(
        repository=BuilderGenerationRepository(tenant_context),
        builder_repository=SiteBuilderRepository(tenant_context),
        design_system_repository=ProjectDesignSystemsRepository(tenant_context),
        component_catalog_resolver=get_official_component_catalog_registry(),
    )


GenerationService = Annotated[
    BuilderGenerationService,
    Depends(get_builder_generation_service),
]


def get_builder_composition_saga_service(_ctx: ProjectContext) -> BuilderCompositionSagaService:
    tenant_context = require_current_tenant_context()
    settings = get_settings()
    generation_repository = BuilderGenerationRepository(tenant_context)
    builder_repository = SiteBuilderRepository(tenant_context)
    design_system_repository = ProjectDesignSystemsRepository(tenant_context)
    component_catalog_resolver = get_official_component_catalog_registry()
    generation_service = BuilderGenerationService(
        repository=generation_repository,
        builder_repository=builder_repository,
        design_system_repository=design_system_repository,
        component_catalog_resolver=component_catalog_resolver,
        settings=settings,
    )
    return BuilderCompositionSagaService(
        repository=BuilderCompositionSagaRepository(tenant_context),
        generation_repository=generation_repository,
        builder_repository=builder_repository,
        authority_resolver=CanonicalBuilderGenerationAuthorityResolver(
            generation_repository=generation_repository,
            builder_repository=builder_repository,
            agent_catalog_service=AgentCatalogService(settings),
            builder_context_resolver=AgentBuilderContextResolver(repository=builder_repository),
        ),
        composition_child_creator=BuilderCompositionChildCreator(
            generation_repository=generation_repository,
            builder_repository=builder_repository,
            design_system_repository=design_system_repository,
            component_catalog_resolver=component_catalog_resolver,
            settings=settings,
        ),
        generation_service=generation_service,
        settings=settings,
    )


CompositionSagaService = Annotated[
    BuilderCompositionSagaService,
    Depends(get_builder_composition_saga_service),
]


@router.get(
    "",
    response_model=ResponseModel[ProjectBuilderProjectionOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="Get the composed Builder projection",
)
async def get_project_builder(
    ctx: ProjectContext,
    service: Service,
) -> ResponseModel[ProjectBuilderProjectionOut]:
    data = await service.get_projection(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/component-catalog",
    response_model=ResponseModel[BuilderComponentCatalogOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="Get the exact registered component catalog for the current Builder revision",
)
async def get_project_builder_component_catalog(
    ctx: ProjectContext,
    service: Service,
) -> ResponseModel[BuilderComponentCatalogOut]:
    data = await service.get_component_catalog(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/history",
    response_model=ResponseModel[BuilderRevisionHistoryOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="List immutable Builder revision history",
)
async def list_project_builder_history(
    ctx: ProjectContext,
    service: Service,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[PublicUUID | None, Query()] = None,
) -> ResponseModel[BuilderRevisionHistoryOut]:
    data = await service.get_revision_history(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        limit=limit,
        cursor=UUID(str(cursor)) if cursor is not None else None,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/revisions/{revision_id}",
    response_model=ResponseModel[BuilderRevisionOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="Get one immutable Builder revision projection",
)
async def get_project_builder_revision(
    revision_id: PublicUUID,
    ctx: ProjectContext,
    service: Service,
) -> ResponseModel[BuilderRevisionOut]:
    data = await service.get_revision(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        revision_id=UUID(str(revision_id)),
    )
    return ApiResponse.success(data=data)


@router.get(
    "/draft-checkpoint",
    response_model=ResponseModel[BuilderDraftCheckpointOut | None],
    dependencies=[require_project_permission("project:site:read")],
    summary="Read the current durable Builder draft checkpoint",
)
async def get_project_builder_draft_checkpoint(
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: DraftCheckpointService,
    client_session_id: Annotated[str, Query(min_length=1, max_length=128)] = "project-editor",
) -> ResponseModel[BuilderDraftCheckpointOut | None]:
    data = await service.get(
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        actor_user_id=actor_user_id,
        client_session_id=client_session_id,
    )
    return ApiResponse.success(data=data)


@router.put(
    "/draft-checkpoint",
    response_model=ResponseModel[BuilderDraftCheckpointOut],
    status_code=status.HTTP_200_OK,
    dependencies=[
        require_project_permission("project:content:site-builder:write"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Persist the current Builder draft checkpoint",
)
async def save_project_builder_draft_checkpoint(
    payload: BuilderDraftCheckpointSaveIn,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: DraftCheckpointService,
) -> ResponseModel[BuilderDraftCheckpointOut]:
    data = await service.save(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.delete(
    "/draft-checkpoint",
    response_model=ResponseModel[BuilderDraftCheckpointOut | None],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Discard the current Builder draft checkpoint",
)
async def discard_project_builder_draft_checkpoint(
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: DraftCheckpointService,
    client_session_id: Annotated[str, Query(min_length=1, max_length=128)] = "project-editor",
    expected_checkpoint_version: Annotated[int, Query(ge=1)] = 1,
) -> ResponseModel[BuilderDraftCheckpointOut | None]:
    data = await service.discard(
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        actor_user_id=actor_user_id,
        client_session_id=client_session_id,
        expected_checkpoint_version=expected_checkpoint_version,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/revisions/{revision_id}/pages/{page_item_id}/render-document",
    response_model=ResponseModel[BuilderPageRenderDocumentOut],
    dependencies=[require_project_permission("project:site:read")],
    summary="Get a strict revision-pinned page renderer document",
)
async def get_project_builder_page_render_document(
    revision_id: PublicUUID,
    page_item_id: PublicUUID,
    response: Response,
    ctx: ProjectContext,
    service: Service,
    locale: Annotated[str, Query(min_length=1, max_length=16)],
    theme: Annotated[str | None, Query(min_length=1, max_length=64)] = None,
) -> ResponseModel[BuilderPageRenderDocumentOut]:
    response.headers["Cache-Control"] = "private, no-store"
    data = await service.get_page_render_document(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        revision_id=UUID(str(revision_id)),
        page_item_id=UUID(str(page_item_id)),
        locale=locale,
        theme_key=theme,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/initializations",
    response_model=ResponseModel[BuilderInitializationOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        require_project_permission("project:content:site-builder:write"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Create the exact root Builder revision",
)
async def initialize_project_builder(
    payload: BuilderInitializationRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: Service,
) -> ResponseModel[BuilderInitializationOut]:
    data = await service.initialize(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/change-sets/preview",
    response_model=ResponseModel[BuilderChangeSetPreviewOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        require_project_permission("project:content:site-builder:write"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Preview and persist a typed Builder ChangeSet",
)
async def preview_builder_change_set(
    payload: BuilderChangeSetPreviewRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: ChangeSetService,
) -> ResponseModel[BuilderChangeSetPreviewOut]:
    data = await service.preview(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/change-sets/{change_set_id}/apply",
    response_model=ResponseModel[BuilderChangeSetApplyOut],
    dependencies=[
        require_project_permission("project:content:site-builder:write"),
        require_project_permission("project:content:items:write"),
        require_project_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
    summary="Apply a fresh approved Builder ChangeSet",
)
async def apply_builder_change_set(
    change_set_id: PublicUUID,
    payload: BuilderChangeSetApplyRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: ChangeSetService,
) -> ResponseModel[BuilderChangeSetApplyOut]:
    data = await service.apply(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        actor_user_id=actor_user_id,
        change_set_id=UUID(str(change_set_id)),
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/composition-sagas",
    response_model=ResponseModel[BuilderCompositionSagaOut],
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[
        require_project_permission("project:content:site-builder:write"),
        Depends(require_builder_generation_entitlement),
        require_project_commercial_effect(RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT),
    ],
    summary="Start a durable planning-to-composition site workflow",
)
async def create_builder_composition_saga(
    payload: BuilderCompositionSagaCreateRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: CompositionSagaService,
) -> ResponseModel[BuilderCompositionSagaOut]:
    data = await service.create(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/composition-sagas/recovery",
    response_model=ResponseModel[BuilderCompositionSagaRecoveryOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Recover the creator-owned site composition for an exact target scope",
)
async def recover_builder_composition_saga(
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: CompositionSagaService,
    targets: Annotated[list[str], Query(alias="target", min_length=1, max_length=100)],
) -> ResponseModel[BuilderCompositionSagaRecoveryOut]:
    data = await service.recover(
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
        targets=_parse_recovery_targets(targets),
    )
    return ApiResponse.success(data=data)


@router.get(
    "/composition-sagas/{saga_id}",
    response_model=ResponseModel[BuilderCompositionSagaOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Get one durable planning-to-composition site workflow",
)
async def get_builder_composition_saga(
    saga_id: PublicUUID,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: CompositionSagaService,
) -> ResponseModel[BuilderCompositionSagaOut]:
    data = await service.get(
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
        saga_id=UUID(str(saga_id)),
    )
    return ApiResponse.success(data=data)


@router.post(
    "/composition-sagas/{saga_id}/phase-transitions",
    response_model=ResponseModel[BuilderCompositionSagaOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Advance a site composition from persisted Apply evidence",
)
async def transition_builder_composition_saga_phase(
    saga_id: PublicUUID,
    payload: BuilderCompositionSagaPhaseTransitionRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: CompositionSagaService,
) -> ResponseModel[BuilderCompositionSagaOut]:
    data = await service.transition_phase(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        actor_user_id=actor_user_id,
        saga_id=UUID(str(saga_id)),
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/composition-sagas/{saga_id}/cancel",
    response_model=ResponseModel[BuilderCompositionSagaOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Cancel a site composition or its active child generation",
)
async def cancel_builder_composition_saga(
    saga_id: PublicUUID,
    payload: BuilderCompositionSagaCancelRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: CompositionSagaService,
) -> ResponseModel[BuilderCompositionSagaOut]:
    data = await service.cancel(
        organization_id=ctx.organization_id,
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
        saga_id=UUID(str(saga_id)),
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/generations",
    response_model=ResponseModel[BuilderGenerationOut],
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[
        require_project_permission("project:content:site-builder:write"),
        Depends(require_builder_generation_entitlement),
        require_project_commercial_effect(RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT),
    ],
    summary="Start a durable Sitemap, Wireframe, or Design generation",
)
async def create_builder_generation(
    payload: BuilderGenerationCreateRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    service: GenerationService,
) -> ResponseModel[BuilderGenerationOut]:
    data = await service.create(
        organization_id=ctx.organization_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        runtime_id=ctx.runtime_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/generations/recovery",
    response_model=ResponseModel[BuilderGenerationRecoveryOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Recover the selected Builder generation state",
)
async def recover_builder_generation(
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: GenerationService,
    target_stage: Annotated[Literal["wireframe", "design"], Query(alias="target_stage")],
    targets: Annotated[list[str], Query(alias="target", min_length=1, max_length=100)],
) -> ResponseModel[BuilderGenerationRecoveryOut]:
    data = await service.recover(
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
        target_stage=target_stage,
        targets=_parse_recovery_targets(targets),
    )
    return ApiResponse.success(data=data)


def _parse_recovery_targets(raw_targets: list[str]) -> tuple[BuilderGenerationTargetV1, ...]:
    targets: list[BuilderGenerationTargetV1] = []
    identities: set[tuple[str, UUID]] = set()
    for index, raw_target in enumerate(raw_targets):
        kind, separator, item_id = raw_target.partition(":")
        if not separator:
            _raise_target_query_error(index=index, raw_target=raw_target, message="target must use kind:itemId")
        try:
            target = BuilderGenerationTargetV1.model_validate({"kind": kind, "itemId": item_id})
        except ValidationError as error:
            details = error.errors()
            for detail in details:
                detail["loc"] = ("query", "target", index, *detail.get("loc", ()))
            raise RequestValidationError(details) from error
        identity = (target.kind, UUID(str(target.item_id)))
        if identity in identities:
            _raise_target_query_error(index=index, raw_target=raw_target, message="targets must be unique")
        identities.add(identity)
        targets.append(target)
    return tuple(targets)


def _raise_target_query_error(*, index: int, raw_target: str, message: str) -> None:
    raise RequestValidationError([
        {
            "type": "value_error",
            "loc": ("query", "target", index),
            "msg": f"Value error, {message}",
            "input": raw_target,
            "ctx": {"error": ValueError(message)},
        }
    ])


@router.get(
    "/generations/{generation_id}",
    response_model=ResponseModel[BuilderGenerationOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Get durable Builder generation progress and candidates",
)
async def get_builder_generation(
    generation_id: PublicUUID,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: GenerationService,
) -> ResponseModel[BuilderGenerationOut]:
    data = await service.get(
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
        generation_id=UUID(str(generation_id)),
    )
    return ApiResponse.success(data=data)


@router.post(
    "/generations/{generation_id}/cancel",
    response_model=ResponseModel[BuilderGenerationOut],
    dependencies=[require_project_permission("project:content:site-builder:write")],
    summary="Request cooperative cancellation of a Builder generation",
)
async def cancel_builder_generation(
    generation_id: PublicUUID,
    payload: BuilderGenerationCancelRequest,
    ctx: ProjectContext,
    actor_user_id: ActorUserId,
    service: GenerationService,
) -> ResponseModel[BuilderGenerationOut]:
    data = await service.cancel(
        project_id=ctx.project_id,
        actor_user_id=actor_user_id,
        generation_id=UUID(str(generation_id)),
        payload=payload,
    )
    return ApiResponse.success(data=data)
