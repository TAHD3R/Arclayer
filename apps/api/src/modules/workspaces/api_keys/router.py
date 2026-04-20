from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.models.organization.org_membership import OrgMembership
from src.modules.auth.http.service import get_current_user_id
from src.modules.organization.http.service import get_current_org_membership
from src.modules.projects.api_keys.events import (
    organization_id_from_membership,
    publish_api_key_event,
)
from src.modules.projects.api_keys.schema import (
    ApiKeyCreateOut,
    ApiKeyListOut,
    ApiKeyOut,
    PersonalApiKeyCreateIn,
)
from src.modules.projects.api_keys.service import ProjectApiKeysService

me_api_keys_router = APIRouter(prefix="/me/api-keys", tags=["domain.me.api_keys"])


def get_api_keys_service(settings: Settings = Depends(get_settings)) -> ProjectApiKeysService:
    return ProjectApiKeysService(settings)


@me_api_keys_router.get(
    "",
    response_model=ResponseModel[ApiKeyListOut],
    summary="List personal management API keys",
)
async def list_personal_api_keys(
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectApiKeysService, Depends(get_api_keys_service)],
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
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: Annotated[ProjectApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.create_personal_key_out(owner_user_id=user_id, payload=payload)
    await publish_api_key_event(
        actor_user_id=user_id,
        event_name="me.api_key.created",
        key=data.key,
        organization_id=organization_id_from_membership(orgm),
    )
    return ApiResponse.success(data=data)


@me_api_keys_router.get(
    "/{key_id}",
    response_model=ResponseModel[ApiKeyOut],
    summary="Get a personal management API key",
)
async def get_personal_api_key(
    key_id: PublicUUID,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[ProjectApiKeysService, Depends(get_api_keys_service)],
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
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: Annotated[ProjectApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyOut]:
    data = await service.revoke_personal_key_out(owner_user_id=user_id, key_id=key_id)
    await publish_api_key_event(
        actor_user_id=user_id,
        event_name="me.api_key.revoked",
        key=data,
        organization_id=organization_id_from_membership(orgm),
    )
    return ApiResponse.success(data=data)


@me_api_keys_router.post(
    "/{key_id}/rotate",
    response_model=ResponseModel[ApiKeyCreateOut],
    summary="Rotate a personal management API key",
)
async def rotate_personal_api_key(
    key_id: PublicUUID,
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    orgm: Annotated[OrgMembership, Depends(get_current_org_membership)],
    service: Annotated[ProjectApiKeysService, Depends(get_api_keys_service)],
) -> ResponseModel[ApiKeyCreateOut]:
    data = await service.rotate_personal_key_out(owner_user_id=user_id, key_id=key_id)
    await publish_api_key_event(
        actor_user_id=user_id,
        event_name="me.api_key.rotated",
        key=data.key,
        organization_id=organization_id_from_membership(orgm),
    )
    return ApiResponse.success(data=data)
