from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.api_keys.events import publish_api_key_event
from src.modules.projects.api_keys.schema import (
    ApiKeyCreateOut,
    ApiKeyListOut,
    ApiKeyOut,
    ProjectApiKeyCreateIn,
)
from src.modules.projects.api_keys.service import ProjectApiKeysService
from src.modules.projects.http.router_helpers import (
    get_project_runtime_context,
    get_project_runtime_service,
    require_project_permission,
    workspace_context_from_project,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.service import ProjectRuntimeService

router = APIRouter(prefix="/projects/{project_id}/api-keys", tags=["domain.projects.api_keys"])


def get_project_api_keys_service(settings: Settings = Depends(get_settings)) -> ProjectApiKeysService:
    return ProjectApiKeysService(settings)


@router.get(
    "",
    response_model=ResponseModel[ApiKeyListOut],
    summary="List project service and delivery API keys",
    dependencies=[require_project_permission("system:keys:read")],
)
async def list_project_api_keys(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyListOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.list_project_site_keys_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Create a project service or delivery API key",
    dependencies=[require_project_permission("system:keys:manage")],
)
async def create_project_api_key(
    payload: ProjectApiKeyCreateIn,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.create_project_site_key_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
        actor_user_id=actor_user_id,
        payload=payload,
    )
    await publish_api_key_event(
        actor_user_id=actor_user_id,
        event_name="project.api_key.created",
        key=data.key,
        ctx=workspace_context_from_project(ctx),
    )
    return ApiResponse.success(data=data)


@router.get(
    "/{key_id}",
    response_model=ResponseModel[ApiKeyOut],
    summary="Get a project service or delivery API key",
    dependencies=[require_project_permission("system:keys:read")],
)
async def get_project_api_key(
    key_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.get_project_site_key_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
        key_id=key_id,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{key_id}/revoke",
    response_model=ResponseModel[ApiKeyOut],
    summary="Revoke a project service or delivery API key",
    dependencies=[require_project_permission("system:keys:manage")],
)
async def revoke_project_api_key(
    key_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.revoke_project_site_key_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
        key_id=key_id,
    )
    await publish_api_key_event(
        actor_user_id=actor_user_id,
        event_name="project.api_key.revoked",
        key=data,
        ctx=workspace_context_from_project(ctx),
    )
    return ApiResponse.success(data=data)


@router.post(
    "/{key_id}/rotate",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Rotate a project service or delivery API key",
    dependencies=[require_project_permission("system:keys:manage")],
)
async def rotate_project_api_key(
    key_id: PublicUUID,
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
    actor_user_id: Annotated[UUID, Depends(get_current_user_id)],
    runtime_service: Annotated[ProjectRuntimeService, Depends(get_project_runtime_service)],
    service: Annotated[ProjectApiKeysService, Depends(get_project_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    runtime_context = await get_project_runtime_context(
        ctx=ctx,
        actor_user_id=actor_user_id,
        runtime_service=runtime_service,
    )
    data = await service.rotate_project_site_key_out(
        workspace_id=runtime_context.workspace_id,
        site_id=runtime_context.site_id,
        key_id=key_id,
    )
    await publish_api_key_event(
        actor_user_id=actor_user_id,
        event_name="project.api_key.rotated",
        key=data.key,
        ctx=workspace_context_from_project(ctx),
    )
    return ApiResponse.success(data=data)
