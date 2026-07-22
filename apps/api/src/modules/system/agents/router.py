from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.models.organization.user import User
from src.modules.analytics.audit import write_required_activity_event
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.agents.repository import SystemAgentRepository
from src.modules.system.agents.schema import (
    AgentVersionCreateRequest,
    AgentVersionRetireRequest,
    SystemAgentAssignmentCreateRequest,
    SystemAgentAssignmentOut,
    SystemAgentAssignmentUpdateRequest,
    SystemAgentCatalogCapabilitiesOut,
    SystemAgentDefinitionCreateRequest,
    SystemAgentDefinitionDetailOut,
    SystemAgentDefinitionSummaryOut,
    SystemAgentDefinitionUpdateRequest,
    SystemAgentVersionListOut,
    SystemAgentVersionOut,
)
from src.modules.system.agents.service import SystemAgentCatalogService
from src.modules.system.agents.skill_grant_validator import TenantAgentVersionSkillGrantValidator

router = APIRouter(
    tags=["internal.system.agents"],
    dependencies=[Depends(require_super_admin)],
)

assignments_router = APIRouter(
    tags=["internal.system.agent-assignments"],
    dependencies=[Depends(require_super_admin)],
)


def get_system_agent_catalog_service(
    settings: Settings = Depends(get_settings),
) -> SystemAgentCatalogService:
    return SystemAgentCatalogService(
        settings,
        repository=SystemAgentRepository(),
        activity_writer=write_required_activity_event,
        skill_grant_validator=TenantAgentVersionSkillGrantValidator(),
    )


@router.get(
    "/capabilities",
    response_model=ResponseModel[SystemAgentCatalogCapabilitiesOut],
    summary="Get System Agent control-plane capabilities",
)
async def get_system_agent_capabilities() -> ResponseModel[SystemAgentCatalogCapabilitiesOut]:
    return ApiResponse.success(data=SystemAgentCatalogService.capabilities())


@router.get(
    "",
    response_model=ResponseModel[PageData[SystemAgentDefinitionSummaryOut]],
    summary="List System Agent definitions",
)
async def list_system_agents(
    params: PageParams = Depends(get_page_params),
    query: Annotated[str | None, Query(alias="q", min_length=1, max_length=128)] = None,
    lifecycle_state: Annotated[
        Literal["active", "disabled", "archived"] | None,
        Query(alias="lifecycleState"),
    ] = None,
    scope: Annotated[Literal["system", "workspace"] | None, Query()] = None,
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[PageData[SystemAgentDefinitionSummaryOut]]:
    return ApiResponse.success(
        data=await service.list_definitions(
            params=params,
            query=query,
            lifecycle_state=lifecycle_state,
            scope=scope,
        )
    )


@router.post(
    "",
    response_model=ResponseModel[SystemAgentDefinitionDetailOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create a System Agent definition with an initial immutable version",
)
async def create_system_agent(
    payload: SystemAgentDefinitionCreateRequest,
    actor: User = Depends(get_current_user),
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[SystemAgentDefinitionDetailOut]:
    return ApiResponse.success(
        data=await service.create_definition(
            payload=payload,
            actor_user_id=actor.id,
        )
    )


@router.get(
    "/{definition_id}",
    response_model=ResponseModel[SystemAgentDefinitionDetailOut],
    summary="Get a System Agent definition",
)
async def get_system_agent(
    definition_id: PublicUUID,
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[SystemAgentDefinitionDetailOut]:
    return ApiResponse.success(data=await service.get_definition(definition_id=definition_id))


@router.patch(
    "/{definition_id}",
    response_model=ResponseModel[SystemAgentDefinitionDetailOut],
    summary="Update mutable System Agent definition metadata",
)
async def update_system_agent(
    definition_id: PublicUUID,
    payload: SystemAgentDefinitionUpdateRequest,
    actor: User = Depends(get_current_user),
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[SystemAgentDefinitionDetailOut]:
    return ApiResponse.success(
        data=await service.update_definition(
            definition_id=definition_id,
            payload=payload,
            actor_user_id=actor.id,
        )
    )


@router.get(
    "/{definition_id}/versions",
    response_model=ResponseModel[SystemAgentVersionListOut],
    summary="List immutable versions for a System Agent",
)
async def list_system_agent_versions(
    definition_id: PublicUUID,
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[SystemAgentVersionListOut]:
    definition = await service.get_definition(definition_id=definition_id)
    return ApiResponse.success(data=SystemAgentVersionListOut(items=definition.versions))


@router.post(
    "/{definition_id}/versions",
    response_model=ResponseModel[SystemAgentVersionOut],
    status_code=status.HTTP_201_CREATED,
    summary="Publish an immutable System Agent version",
)
async def create_system_agent_version(
    definition_id: PublicUUID,
    payload: AgentVersionCreateRequest,
    actor: User = Depends(get_current_user),
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[SystemAgentVersionOut]:
    return ApiResponse.success(
        data=await service.create_version(
            definition_id=definition_id,
            payload=payload,
            actor_user_id=actor.id,
        )
    )


@router.patch(
    "/{definition_id}/versions/{version_id}",
    response_model=ResponseModel[SystemAgentVersionOut],
    summary="Retire an immutable System Agent version",
)
async def retire_system_agent_version(
    definition_id: PublicUUID,
    version_id: PublicUUID,
    _payload: AgentVersionRetireRequest,
    actor: User = Depends(get_current_user),
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[SystemAgentVersionOut]:
    return ApiResponse.success(
        data=await service.retire_version(
            definition_id=definition_id,
            version_id=version_id,
            actor_user_id=actor.id,
        )
    )


@assignments_router.get(
    "",
    response_model=ResponseModel[PageData[SystemAgentAssignmentOut]],
    summary="List System Agent assignments",
)
async def list_system_agent_assignments(
    params: PageParams = Depends(get_page_params),
    workspace_id: Annotated[PublicUUID | None, Query(alias="workspaceId")] = None,
    project_id: Annotated[PublicUUID | None, Query(alias="projectId")] = None,
    definition_id: Annotated[PublicUUID | None, Query(alias="agentId")] = None,
    enabled: Annotated[bool | None, Query()] = None,
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[PageData[SystemAgentAssignmentOut]]:
    return ApiResponse.success(
        data=await service.list_assignments(
            params=params,
            workspace_id=workspace_id,
            project_id=project_id,
            definition_id=definition_id,
            enabled=enabled,
        )
    )


@assignments_router.post(
    "",
    response_model=ResponseModel[SystemAgentAssignmentOut],
    status_code=status.HTTP_201_CREATED,
    summary="Create a System Agent assignment",
)
async def create_system_agent_assignment(
    payload: SystemAgentAssignmentCreateRequest,
    actor: User = Depends(get_current_user),
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[SystemAgentAssignmentOut]:
    return ApiResponse.success(
        data=await service.create_assignment(
            payload=payload,
            actor_user_id=actor.id,
        )
    )


@assignments_router.patch(
    "/{assignment_id}",
    response_model=ResponseModel[SystemAgentAssignmentOut],
    summary="Update a System Agent assignment",
)
async def update_system_agent_assignment(
    assignment_id: PublicUUID,
    payload: SystemAgentAssignmentUpdateRequest,
    actor: User = Depends(get_current_user),
    service: SystemAgentCatalogService = Depends(get_system_agent_catalog_service),
) -> ResponseModel[SystemAgentAssignmentOut]:
    return ApiResponse.success(
        data=await service.update_assignment(
            assignment_id=assignment_id,
            payload=payload,
            actor_user_id=actor.id,
        )
    )
