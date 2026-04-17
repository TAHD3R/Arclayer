from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.api_keys.schema import (
    ApiKeyCreateOut,
    ApiKeyListOut,
    ApiKeyOut,
    PersonalApiKeyCreateIn,
    WorkspaceApiKeyCreateIn,
)
from src.modules.workspaces.api_keys.service import WorkspaceApiKeysService
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.content.shared.router import _resolve_site_id
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

me_api_keys_router = APIRouter(prefix="/me/api-keys", tags=["domain.me.api_keys"])
workspace_api_keys_router = APIRouter(
    prefix="/workspaces/{workspace_id}/api-keys",
    tags=["domain.workspaces.api_keys"],
)


def get_api_keys_service(settings: Settings = Depends(get_settings)) -> WorkspaceApiKeysService:
    return WorkspaceApiKeysService(settings)


@me_api_keys_router.get(
    "",
    response_model=ResponseModel[ApiKeyListOut],
    summary="List personal management API keys",
)
async def list_personal_api_keys(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyListOut]:
    data = await service.list_personal_keys_out(owner_user_id=user_id)
    return ApiResponse.success(data=data)


@me_api_keys_router.post(
    "",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Create a personal management API key",
)
async def create_personal_api_key(
    payload: PersonalApiKeyCreateIn,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.create_personal_key_out(owner_user_id=user_id, payload=payload)
    return ApiResponse.success(data=data)


@me_api_keys_router.get(
    "/{key_id}",
    response_model=ResponseModel[ApiKeyOut],
    summary="Get a personal management API key",
)
async def get_personal_api_key(
    key_id: PublicUUID,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.get_personal_key_out(owner_user_id=user_id, key_id=key_id)
    return ApiResponse.success(data=data)


@me_api_keys_router.post(
    "/{key_id}/revoke",
    response_model=ResponseModel[ApiKeyOut],
    summary="Revoke a personal management API key",
)
async def revoke_personal_api_key(
    key_id: PublicUUID,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.revoke_personal_key_out(owner_user_id=user_id, key_id=key_id)
    return ApiResponse.success(data=data)


@me_api_keys_router.post(
    "/{key_id}/rotate",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Rotate a personal management API key",
)
async def rotate_personal_api_key(
    key_id: PublicUUID,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.rotate_personal_key_out(owner_user_id=user_id, key_id=key_id)
    return ApiResponse.success(data=data)


@workspace_api_keys_router.get(
    "",
    response_model=ResponseModel[ApiKeyListOut],
    summary="List workspace service and delivery API keys",
    dependencies=[require_workspace_permission("system:keys:read")],
)
async def list_workspace_api_keys(
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyListOut]:
    data = await service.list_workspace_keys_out(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=data)


@workspace_api_keys_router.post(
    "",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Create a workspace service or delivery API key",
    dependencies=[require_workspace_permission("system:keys:manage")],
)
async def create_workspace_api_key(
    payload: WorkspaceApiKeyCreateIn,
    site_id: Annotated[UUID, Depends(_resolve_site_id)],
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.create_workspace_key_out(
        workspace_id=ctx.workspace_id,
        site_id=site_id,
        actor_user_id=user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@workspace_api_keys_router.get(
    "/{key_id}",
    response_model=ResponseModel[ApiKeyOut],
    summary="Get a workspace service or delivery API key",
    dependencies=[require_workspace_permission("system:keys:read")],
)
async def get_workspace_api_key(
    key_id: PublicUUID,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.get_workspace_key_out(workspace_id=ctx.workspace_id, key_id=key_id)
    return ApiResponse.success(data=data)


@workspace_api_keys_router.post(
    "/{key_id}/revoke",
    response_model=ResponseModel[ApiKeyOut],
    summary="Revoke a workspace service or delivery API key",
    dependencies=[require_workspace_permission("system:keys:manage")],
)
async def revoke_workspace_api_key(
    key_id: PublicUUID,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.revoke_workspace_key_out(workspace_id=ctx.workspace_id, key_id=key_id)
    return ApiResponse.success(data=data)


@workspace_api_keys_router.post(
    "/{key_id}/rotate",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Rotate a workspace service or delivery API key",
    dependencies=[require_workspace_permission("system:keys:manage")],
)
async def rotate_workspace_api_key(
    key_id: PublicUUID,
    ctx: Annotated[WorkspaceContext, Depends(require_workspace_manage_access)],
    service: Annotated[WorkspaceApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.rotate_workspace_key_out(workspace_id=ctx.workspace_id, key_id=key_id)
    return ApiResponse.success(data=data)
