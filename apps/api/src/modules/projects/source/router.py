from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.command_policy import build_restricted_recovery_command_policy
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.projects.http.router_helpers import require_project_permission
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.source.schema import (
    ProjectSourceFileDeleteOut,
    ProjectSourceFileOut,
    ProjectSourceFileUpsertIn,
    ProjectSourceManifestOut,
)
from src.modules.projects.source.service import ProjectSourceService

router = APIRouter(prefix="/projects/{project_id}/source", tags=["domain.projects.source"])


def get_project_source_service(settings: Settings = Depends(get_settings)) -> ProjectSourceService:
    return ProjectSourceService(settings)


@router.get(
    "/manifest",
    response_model=ResponseModel[ProjectSourceManifestOut],
    response_model_exclude_none=True,
    summary="Get project source manifest",
    dependencies=[require_project_permission("project:settings:read")],
)
async def get_project_source_manifest(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectSourceService, Depends(get_project_source_service)],
) -> ResponseModel[ProjectSourceManifestOut]:
    manifest = await service.get_source_manifest(project_id=ctx.project_id)
    return ApiResponse.success(data=manifest)


@router.get(
    "/files/{file_path:path}",
    response_model=ResponseModel[ProjectSourceFileOut],
    response_model_exclude_none=True,
    summary="Get project source file",
    dependencies=[require_project_permission("project:settings:read")],
)
async def get_project_source_file(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectSourceService, Depends(get_project_source_service)],
    file_path: str = Path(..., min_length=1),
) -> ResponseModel[ProjectSourceFileOut]:
    file = await service.get_source_file(project_id=ctx.project_id, path=file_path)
    return ApiResponse.success(data=file)


@router.put(
    "/files/{file_path:path}",
    response_model=ResponseModel[ProjectSourceFileOut],
    response_model_exclude_none=True,
    summary="Upsert project source file",
    dependencies=[require_project_permission("project:settings:manage")],
)
async def upsert_project_source_file(
    payload: ProjectSourceFileUpsertIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectSourceService, Depends(get_project_source_service)],
    actor_user_id: UUID = Depends(get_current_user_id),
    file_path: str = Path(..., min_length=1),
) -> ResponseModel[ProjectSourceFileOut]:
    await build_restricted_recovery_command_policy().authorize(
        workspace_id=ctx.workspace_id,
        effects={RestrictedRecoveryEffect.CONTENT_MUTATION},
    )
    file = await service.upsert_source_file(
        project_id=ctx.project_id,
        path=file_path,
        payload=payload,
        actor_user_id=actor_user_id,
    )
    return ApiResponse.success(data=file)


@router.delete(
    "/files/{file_path:path}",
    response_model=ResponseModel[ProjectSourceFileDeleteOut],
    response_model_exclude_none=True,
    summary="Delete project source file",
    dependencies=[require_project_permission("project:settings:manage")],
)
async def delete_project_source_file(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    service: Annotated[ProjectSourceService, Depends(get_project_source_service)],
    actor_user_id: UUID = Depends(get_current_user_id),
    file_path: str = Path(..., min_length=1),
) -> ResponseModel[ProjectSourceFileDeleteOut]:
    await build_restricted_recovery_command_policy().authorize(
        workspace_id=ctx.workspace_id,
        effects={RestrictedRecoveryEffect.CONTENT_MUTATION},
    )
    result = await service.delete_source_file(
        project_id=ctx.project_id,
        path=file_path,
        actor_user_id=actor_user_id,
    )
    return ApiResponse.success(data=result)
