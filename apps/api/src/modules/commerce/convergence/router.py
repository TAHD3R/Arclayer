"""Workspace-authorized Plan Access Convergence API."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import Conflict
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.response import ApiResponse, ResponseModel
from src.core.registries import ConnectorRegistry
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.authorization import require_workspace_commerce_manage_access
from src.modules.commerce.convergence.composition import build_plan_access_convergence_service
from src.modules.commerce.convergence.schema import (
    ConvergencePreview,
    ConvergencePreviewRequest,
)
from src.modules.commerce.convergence.service import PlanAccessConvergenceService
from src.modules.commerce.subscription_transitions.composition import build_subscription_transition_service
from src.modules.commerce.subscription_transitions.schema import (
    RenewalTransitionScheduleOut,
    RenewalTransitionScheduleRequest,
)
from src.modules.commerce.subscription_transitions.service import SubscriptionTransitionService
from src.modules.workspaces.http.schema import WorkspaceContext

router = APIRouter(
    prefix="/workspaces/{workspace_id}/commerce/access-convergence",
    tags=["domain.commerce.access-convergence"],
)


def get_plan_access_convergence_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> PlanAccessConvergenceService:
    return build_plan_access_convergence_service(settings)


PlanAccessConvergenceServiceDependency = Annotated[
    PlanAccessConvergenceService,
    Depends(get_plan_access_convergence_service),
]


def get_subscription_transition_service(
    settings: Annotated[Settings, Depends(get_settings)],
    connectors: Annotated[ConnectorRegistry, Depends(get_connector_registry)],
) -> SubscriptionTransitionService:
    return build_subscription_transition_service(settings, connectors)


SubscriptionTransitionServiceDependency = Annotated[
    SubscriptionTransitionService,
    Depends(get_subscription_transition_service),
]


@router.post(
    "/previews",
    response_model=ResponseModel[ConvergencePreview],
    summary="Preview the exact access retirement required for a Plan Revision transition",
)
async def create_plan_access_convergence_preview(
    workspace_id: PublicUUID,
    payload: ConvergencePreviewRequest,
    service: PlanAccessConvergenceServiceDependency,
    ctx: WorkspaceContext = Depends(require_workspace_commerce_manage_access),
) -> ResponseModel[ConvergencePreview]:
    if workspace_id != ctx.workspace_id or payload.workspace_id != ctx.workspace_id:
        raise Conflict(error="PLAN_ACCESS_CONVERGENCE_WORKSPACE_MISMATCH")
    return ApiResponse.success(data=await service.create_preview(request=payload))


@router.post(
    "/previews/{preview_id}/schedule",
    response_model=ResponseModel[RenewalTransitionScheduleOut],
    summary="Schedule a reviewed convergence through the configured Provider",
)
async def schedule_plan_access_convergence(
    workspace_id: PublicUUID,
    preview_id: PublicUUID,
    payload: RenewalTransitionScheduleRequest,
    service: SubscriptionTransitionServiceDependency,
    actor_user_id: UUID = Depends(get_current_user_id),
    ctx: WorkspaceContext = Depends(require_workspace_commerce_manage_access),
) -> ResponseModel[RenewalTransitionScheduleOut]:
    if workspace_id != ctx.workspace_id or preview_id != payload.preview_id:
        raise Conflict(error="PLAN_ACCESS_CONVERGENCE_WORKSPACE_MISMATCH")
    return ApiResponse.success(data=await service.schedule_renewal(request=payload, actor_user_id=actor_user_id))
