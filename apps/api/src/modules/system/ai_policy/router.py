from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.system.ai_policy.schema import (
    AiPolicyApplyOut,
    AiPolicyApplyRequest,
    AiPolicyDraftInput,
    AiPolicyOut,
    AiPolicyPreviewOut,
    AiPolicyPreviewRequest,
    AiPolicyPublishRequest,
    AiPolicyRevisionOut,
)
from src.modules.system.ai_policy.service import SystemAiPolicyService

router = APIRouter(tags=["platform.ai_policy"])


def get_ai_policy_service(settings: Settings = Depends(get_settings)) -> SystemAiPolicyService:
    return SystemAiPolicyService(settings)


@router.get(
    "/policies",
    response_model=ResponseModel[AiPolicyOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_POLICY_READ)],
)
async def get_ai_policy(service: SystemAiPolicyService = Depends(get_ai_policy_service)) -> ResponseModel[AiPolicyOut]:
    return ApiResponse.success(data=await service.get_policy())


@router.put(
    "/policies/draft",
    response_model=ResponseModel[AiPolicyRevisionOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_POLICY_MANAGE)],
)
async def save_ai_policy_draft(
    payload: AiPolicyDraftInput,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_POLICY_MANAGE),
    service: SystemAiPolicyService = Depends(get_ai_policy_service),
) -> ResponseModel[AiPolicyRevisionOut]:
    return ApiResponse.success(data=await service.create_or_replace_draft(payload, actor_user_id=principal.actor_id))


@router.post(
    "/policies/previews",
    response_model=ResponseModel[AiPolicyPreviewOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_POLICY_MANAGE)],
)
async def preview_ai_policy(
    payload: AiPolicyPreviewRequest,
    service: SystemAiPolicyService = Depends(get_ai_policy_service),
) -> ResponseModel[AiPolicyPreviewOut]:
    return ApiResponse.success(data=await service.preview(payload.draft_id))


@router.post(
    "/policies/publish",
    response_model=ResponseModel[AiPolicyRevisionOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_POLICY_MANAGE)],
)
async def publish_ai_policy(
    payload: AiPolicyPublishRequest,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_POLICY_MANAGE),
    service: SystemAiPolicyService = Depends(get_ai_policy_service),
) -> ResponseModel[AiPolicyRevisionOut]:
    return ApiResponse.success(data=await service.publish(payload, actor_user_id=principal.actor_id))


@router.post(
    "/policies/apply",
    response_model=ResponseModel[AiPolicyApplyOut],
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_POLICY_MANAGE)],
)
async def apply_ai_policy(
    payload: AiPolicyApplyRequest,
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_POLICY_MANAGE),
    service: SystemAiPolicyService = Depends(get_ai_policy_service),
) -> ResponseModel[AiPolicyApplyOut]:
    return ApiResponse.success(data=await service.apply(payload, actor_user_id=principal.actor_id))
