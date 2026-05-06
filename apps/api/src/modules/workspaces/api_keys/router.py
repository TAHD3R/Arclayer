from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.models.organization.org_membership import OrgMembership
from src.modules.auth.http.service import get_current_user_id
from src.modules.organization.http.service import get_current_org_membership
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


def _organization_id_from_membership(orgm: OrgMembership) -> UUID:
    return UUID(str(cast(HasOrganizationId, orgm).organization_id))


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
    data = await service.create_personal_key_out(
        owner_user_id=user_id,
        organization_id=_organization_id_from_membership(orgm),
        payload=payload,
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
    data = await service.revoke_personal_key_out(
        owner_user_id=user_id,
        organization_id=_organization_id_from_membership(orgm),
        key_id=key_id,
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
    data = await service.rotate_personal_key_out(
        owner_user_id=user_id,
        organization_id=_organization_id_from_membership(orgm),
        key_id=key_id,
    )
    return ApiResponse.success(data=data)
