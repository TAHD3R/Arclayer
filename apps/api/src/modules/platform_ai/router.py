from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.platform_ai.schema import (
    PlatformAIProviderReadinessOut,
    PlatformAITaskListQuery,
    PlatformAITaskOut,
)
from src.modules.platform_ai.service import PlatformAIOperationsService
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode

router = APIRouter(tags=["platform.ai-services"])


def get_platform_ai_service() -> PlatformAIOperationsService:
    return PlatformAIOperationsService()


@router.get(
    "/tasks",
    response_model=ResponseModel[PageData[PlatformAITaskOut]],
    response_model_exclude_none=True,
    summary="List durable AI tasks requiring attention",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_TASKS_READ)],
)
async def list_platform_ai_tasks(
    query: Annotated[PlatformAITaskListQuery, Depends()],
    params: Annotated[PageParams, Depends(get_page_params)],
    service: Annotated[PlatformAIOperationsService, Depends(get_platform_ai_service)],
) -> ResponseModel[PageData[PlatformAITaskOut]]:
    return ApiResponse.success(data=await service.list_tasks(params=params, query=query))


@router.get(
    "/providers/readiness",
    response_model=ResponseModel[PlatformAIProviderReadinessOut],
    response_model_exclude_none=True,
    summary="Read AI provider readiness",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_READ)],
)
async def get_platform_ai_provider_readiness(
    service: Annotated[PlatformAIOperationsService, Depends(get_platform_ai_service)],
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PlatformAIProviderReadinessOut]:
    return ApiResponse.success(data=await service.provider_readiness(settings=settings))
