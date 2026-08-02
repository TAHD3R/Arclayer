from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.analytics.audit import write_required_activity_event
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.system.ai_providers.schema import (
    SystemAIProviderAvailabilityApplyRequest,
    SystemAIProviderAvailabilityPreviewOut,
    SystemAIProviderAvailabilityPreviewRequest,
    SystemAIProviderCreateRequest,
    SystemAIProviderListOut,
    SystemAIProviderOut,
    SystemAIProviderReadinessTestOut,
    SystemAIProviderUpdateRequest,
)
from src.modules.system.ai_providers.service import SystemAIProviderService

router = APIRouter(tags=["internal.system.ai_providers"])


def get_system_ai_provider_service(
    settings: Settings = Depends(get_settings),
) -> SystemAIProviderService:
    return SystemAIProviderService(settings, activity_writer=write_required_activity_event)


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
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE),
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[SystemAIProviderOut]:
    return ApiResponse.success(data=await service.create_provider(payload, actor_user_id=principal.actor_id))


@router.patch(
    "/providers/{provider_id}",
    response_model=ResponseModel[SystemAIProviderOut],
    summary="Update a system AI provider",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE)],
)
async def update_system_ai_provider(
    provider_id: UUID,
    payload: SystemAIProviderUpdateRequest,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE),
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[SystemAIProviderOut]:
    return ApiResponse.success(
        data=await service.update_provider(provider_id, payload, actor_user_id=principal.actor_id)
    )


@router.delete(
    "/providers/{provider_id}",
    response_model=ResponseModel[None],
    summary="Disable a system AI provider",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE)],
)
async def delete_system_ai_provider(
    provider_id: UUID,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE),
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[None]:
    await service.delete_provider(provider_id, actor_user_id=principal.actor_id)
    return ApiResponse.success(data=None)


@router.post(
    "/providers/{provider_id}/availability-preview",
    response_model=ResponseModel[SystemAIProviderAvailabilityPreviewOut],
    summary="Preview AI provider availability impact",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE)],
)
async def preview_system_ai_provider_availability(
    provider_id: UUID,
    payload: SystemAIProviderAvailabilityPreviewRequest,
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[SystemAIProviderAvailabilityPreviewOut]:
    return ApiResponse.success(
        data=await service.preview_availability(provider_id=provider_id, is_active=payload.is_active)
    )


@router.post(
    "/providers/{provider_id}/availability",
    response_model=ResponseModel[SystemAIProviderOut],
    summary="Apply AI provider availability from a current impact preview",
)
async def apply_system_ai_provider_availability(
    provider_id: UUID,
    payload: SystemAIProviderAvailabilityApplyRequest,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE),
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[SystemAIProviderOut]:
    return ApiResponse.success(
        data=await service.apply_availability(
            provider_id=provider_id,
            is_active=payload.is_active,
            preview_revision=payload.preview_revision,
            actor_user_id=principal.actor_id,
        )
    )


@router.post(
    "/providers/{provider_id}/readiness-test",
    response_model=ResponseModel[SystemAIProviderReadinessTestOut],
    summary="Execute a non-disclosing AI provider readiness test",
)
async def test_system_ai_provider_readiness(
    provider_id: UUID,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_MANAGE),
    service: SystemAIProviderService = Depends(get_system_ai_provider_service),
) -> ResponseModel[SystemAIProviderReadinessTestOut]:
    return ApiResponse.success(
        data=await service.test_readiness(provider_id=provider_id, actor_user_id=principal.actor_id)
    )
