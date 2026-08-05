from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.projects.databases.provisioning import get_project_database_provisioner
from src.modules.projects.databases.schema import (
    ProjectDatabaseCreateIn,
    ProjectDatabaseDetailOut,
    ProjectDatabaseListOut,
    ProjectDatabaseRotateCredentialIn,
)
from src.modules.projects.databases.service import ProjectDatabasesService
from src.modules.projects.http.router_helpers import require_project_commercial_effect, require_project_permission
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context

router = APIRouter(prefix="/projects/{project_id}/databases", tags=["domain.projects.databases"])


def get_project_databases_service(settings: Settings = Depends(get_settings)) -> ProjectDatabasesService:
    return ProjectDatabasesService(provisioner=get_project_database_provisioner(settings))


@router.get(
    "",
    response_model=ResponseModel[ProjectDatabaseListOut],
    response_model_exclude_none=True,
    summary="List project databases",
    dependencies=[require_project_permission("project:settings:read")],
)
async def list_project_databases(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectDatabasesService, Depends(get_project_databases_service)],
) -> ResponseModel[ProjectDatabaseListOut]:
    return ApiResponse.success(data=await service.list_databases_out(project_id=ctx.project_id))


@router.post(
    "",
    response_model=ResponseModel[ProjectDatabaseDetailOut],
    response_model_exclude_none=True,
    summary="Create project database",
    dependencies=[
        require_project_permission("project:settings:manage"),
        require_project_commercial_effect(RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT),
    ],
)
async def create_project_database(
    payload: ProjectDatabaseCreateIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectDatabasesService, Depends(get_project_databases_service)],
) -> ResponseModel[ProjectDatabaseDetailOut]:
    return ApiResponse.success(
        data=await service.create_database_out(project_id=ctx.project_id, payload=payload, actor_user_id=actor_user_id)
    )


@router.get(
    "/{database_id}",
    response_model=ResponseModel[ProjectDatabaseDetailOut],
    response_model_exclude_none=True,
    summary="Get project database",
    dependencies=[require_project_permission("project:settings:read")],
)
async def get_project_database(
    database_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectDatabasesService, Depends(get_project_databases_service)],
) -> ResponseModel[ProjectDatabaseDetailOut]:
    return ApiResponse.success(
        data=await service.get_database_detail_out(project_id=ctx.project_id, database_id=database_id)
    )


@router.post(
    "/{database_id}/credentials/rotate",
    response_model=ResponseModel[ProjectDatabaseDetailOut],
    response_model_exclude_none=True,
    summary="Rotate project database credential",
    dependencies=[require_project_permission("project:settings:manage")],
)
async def rotate_project_database_credential(
    database_id: PublicUUID,
    payload: ProjectDatabaseRotateCredentialIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectDatabasesService, Depends(get_project_databases_service)],
) -> ResponseModel[ProjectDatabaseDetailOut]:
    return ApiResponse.success(
        data=await service.rotate_credential_out(project_id=ctx.project_id, database_id=database_id, payload=payload)
    )
