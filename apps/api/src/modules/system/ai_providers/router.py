from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.system.ai_providers.schema import (
    SystemAIProviderCreateRequest,
    SystemAIProviderListOut,
    SystemAIProviderOut,
    SystemAIProviderUpdateRequest,
)
from src.modules.system.ai_providers.service import SystemAIProviderService

router = APIRouter(tags=["internal.system.ai_providers"])


def get_system_ai_provider_service(
    settings: Settings = Depends(get_settings),
) -> SystemAIProviderService:
    return SystemAIProviderService(settings)


@router.get(
    "/providers",
    response_model=ResponseModel[SystemAIProviderListOut],
    summary="List system AI providers",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_READ)],
)
async def list_system_ai_providers(
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[SystemAIProviderListOut]:
    return ApiResponse.success(data=SystemAIProviderListOut(providers=await service.list_providers()))


@router.post(
    "/providers",
    response_model=ResponseModel[SystemAIProviderOut],
    summary="Create a system AI provider",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE)],
)
async def create_system_ai_provider(
    payload: SystemAIProviderCreateRequest,
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[SystemAIProviderOut]:
    return ApiResponse.success(data=await service.create_provider(payload))


@router.patch(
    "/providers/{provider_id}",
    response_model=ResponseModel[SystemAIProviderOut],
    summary="Update a system AI provider",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE)],
)
async def update_system_ai_provider(
    provider_id: UUID,
    payload: SystemAIProviderUpdateRequest,
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[SystemAIProviderOut]:
    return ApiResponse.success(data=await service.update_provider(provider_id, payload))


@router.delete(
    "/providers/{provider_id}",
    response_model=ResponseModel[None],
    summary="Disable a system AI provider",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE)],
)
async def delete_system_ai_provider(
    provider_id: UUID,
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[None]:
    await service.delete_provider(provider_id)
    return ApiResponse.success(data=None)
