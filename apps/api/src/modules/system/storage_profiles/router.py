from __future__ import annotations

from fastapi import APIRouter, Depends

from src.common.utils.public_ids import PublicIdDecodeError, decode_public_id
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.storage_profiles.schema import (
    StorageProfileCreateRequest,
    StorageProfileDeleteOut,
    StorageProfileListOut,
    StorageProfileOut,
    StorageProfileTestResultOut,
    StorageProfileUpdateRequest,
)
from src.modules.system.storage_profiles.service import StorageProfilesService

router = APIRouter(
    tags=["internal.system.storage-profiles"],
    dependencies=[Depends(require_super_admin)],
)


def get_storage_profiles_service(
    settings: Settings = Depends(get_settings),
) -> StorageProfilesService:
    return StorageProfilesService(settings)


def decode_storage_profile_id(profile_id: str):
    try:
        return decode_public_id(profile_id)
    except PublicIdDecodeError as exc:
        raise BadRequest(message="BAD_REQUEST", error="INVALID_STORAGE_PROFILE_ID") from exc


@router.get("", response_model=ResponseModel[StorageProfileListOut], summary="List storage profiles")
async def list_storage_profiles(
    service: StorageProfilesService = Depends(get_storage_profiles_service),
    _user=Depends(get_current_user),
) -> ResponseModel[StorageProfileListOut]:
    return ApiResponse.success(data=await service.list_profiles())


@router.post("", response_model=ResponseModel[StorageProfileOut], summary="Create storage profile")
async def create_storage_profile(
    payload: StorageProfileCreateRequest,
    service: StorageProfilesService = Depends(get_storage_profiles_service),
    user=Depends(get_current_user),
) -> ResponseModel[StorageProfileOut]:
    return ApiResponse.success(data=await service.create_profile(payload=payload, updated_by=getattr(user, "id", None)))


@router.patch(
    "/{profile_id}",
    response_model=ResponseModel[StorageProfileOut],
    summary="Update storage profile",
)
async def update_storage_profile(
    profile_id: str,
    payload: StorageProfileUpdateRequest,
    service: StorageProfilesService = Depends(get_storage_profiles_service),
    user=Depends(get_current_user),
) -> ResponseModel[StorageProfileOut]:
    return ApiResponse.success(
        data=await service.update_profile(
            profile_id=decode_storage_profile_id(profile_id),
            payload=payload,
            updated_by=getattr(user, "id", None),
        )
    )


@router.post(
    "/{profile_id}/test",
    response_model=ResponseModel[StorageProfileTestResultOut],
    summary="Test storage profile",
)
async def test_storage_profile(
    profile_id: str,
    service: StorageProfilesService = Depends(get_storage_profiles_service),
    _user=Depends(get_current_user),
) -> ResponseModel[StorageProfileTestResultOut]:
    return ApiResponse.success(data=await service.test_profile(profile_id=decode_storage_profile_id(profile_id)))


@router.post(
    "/by-key/{profile_key}/test",
    response_model=ResponseModel[StorageProfileTestResultOut],
    summary="Test storage profile by key",
)
async def test_storage_profile_by_key(
    profile_key: str,
    service: StorageProfilesService = Depends(get_storage_profiles_service),
    _user=Depends(get_current_user),
) -> ResponseModel[StorageProfileTestResultOut]:
    return ApiResponse.success(data=await service.test_profile_by_key(profile_key=profile_key))


@router.delete(
    "/{profile_id}",
    response_model=ResponseModel[StorageProfileDeleteOut],
    summary="Delete storage profile",
)
async def delete_storage_profile(
    profile_id: str,
    service: StorageProfilesService = Depends(get_storage_profiles_service),
    user=Depends(get_current_user),
) -> ResponseModel[StorageProfileDeleteOut]:
    return ApiResponse.success(
        data=await service.delete_profile(
            profile_id=decode_storage_profile_id(profile_id),
            updated_by=getattr(user, "id", None),
        )
    )
