from __future__ import annotations

from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.ai.runtime_platform_recovery_schema import (
    PlatformAIRecoveryAction,
    PlatformAIRecoveryAuthority,
    PlatformAIRecoveryCommand,
)
from src.modules.platform_ai.schema import (
    PlatformAIProviderReadinessOut,
    PlatformAITaskActionRequest,
    PlatformAITaskListQuery,
    PlatformAITaskOut,
)
from src.modules.platform_ai.service import PlatformAIOperationsService
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.system.ai_providers.service import SystemAIProviderService

router = APIRouter(tags=["platform.ai-services"])


def get_platform_ai_service(
    settings: Settings = Depends(get_settings),
) -> PlatformAIOperationsService:
    return PlatformAIOperationsService(
        settings,
        provider_reader=SystemAIProviderService(settings),
    )


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


@router.post(
    "/tasks/{task_id}/retry",
    response_model=ResponseModel[PlatformAITaskOut],
    response_model_exclude_none=True,
    summary="Retry a server-eligible AI task",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_TASKS_RECOVER)],
)
async def retry_platform_ai_task(
    task_id: UUID,
    payload: PlatformAITaskActionRequest,
    service: Annotated[PlatformAIOperationsService, Depends(get_platform_ai_service)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_TASKS_RECOVER),
) -> ResponseModel[PlatformAITaskOut]:
    return ApiResponse.success(
        data=await service.execute_task_recovery(
            command=_recovery_command(task_id=task_id, action="retry", payload=payload, principal=principal)
        )
    )


@router.post(
    "/tasks/{task_id}/cancel",
    response_model=ResponseModel[PlatformAITaskOut],
    response_model_exclude_none=True,
    summary="Request cancellation through the AI task authority",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_TASKS_RECOVER)],
)
async def cancel_platform_ai_task(
    task_id: UUID,
    payload: PlatformAITaskActionRequest,
    service: Annotated[PlatformAIOperationsService, Depends(get_platform_ai_service)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_TASKS_RECOVER),
) -> ResponseModel[PlatformAITaskOut]:
    return ApiResponse.success(
        data=await service.execute_task_recovery(
            command=_recovery_command(task_id=task_id, action="cancel", payload=payload, principal=principal)
        )
    )


@router.post(
    "/tasks/{task_id}/reconcile",
    response_model=ResponseModel[PlatformAITaskOut],
    response_model_exclude_none=True,
    summary="Reconcile a partial or unknown AI task outcome",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_TASKS_RECOVER)],
)
async def reconcile_platform_ai_task(
    task_id: UUID,
    payload: PlatformAITaskActionRequest,
    service: Annotated[PlatformAIOperationsService, Depends(get_platform_ai_service)],
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.AI_TASKS_RECOVER),
) -> ResponseModel[PlatformAITaskOut]:
    return ApiResponse.success(
        data=await service.execute_task_recovery(
            command=_recovery_command(task_id=task_id, action="reconcile", payload=payload, principal=principal)
        )
    )


@router.get(
    "/providers/readiness",
    response_model=ResponseModel[PlatformAIProviderReadinessOut],
    response_model_exclude_none=True,
    summary="Read AI provider readiness",
    dependencies=[require_platform_permission(PlatformPermissionCode.AI_PROVIDERS_READ)],
)
async def get_platform_ai_provider_readiness(
    service: Annotated[PlatformAIOperationsService, Depends(get_platform_ai_service)],
) -> ResponseModel[PlatformAIProviderReadinessOut]:
    return ApiResponse.success(data=await service.provider_readiness())


def _recovery_command(
    *,
    task_id: UUID,
    action: PlatformAIRecoveryAction,
    payload: PlatformAITaskActionRequest,
    principal: PlatformSessionPrincipal,
) -> PlatformAIRecoveryCommand:
    return PlatformAIRecoveryCommand(
        task_id=task_id,
        action=action,
        authority=PlatformAIRecoveryAuthority(
            kind="platform_operator",
            actor_user_id=principal.actor_id,
            correlation_id=uuid4(),
        ),
        idempotency_key=payload.idempotency_key,
        reason=payload.reason,
    )
