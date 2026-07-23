from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.organization.user import User
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.commerce.schema import (
    CommercePlanCatalogOut,
    CommercePlanOut,
    CommercePlanUpsertRequest,
    PlanCode,
    WorkspaceCommerceOverviewOut,
    WorkspaceSubscriptionSetRequest,
)
from src.modules.commerce.service import build_commerce_service

router = APIRouter(
    tags=["internal.system.commerce"],
    dependencies=[Depends(require_super_admin)],
)


@router.get(
    "/plans",
    response_model=ResponseModel[CommercePlanCatalogOut],
    summary="List platform commerce plans",
)
async def list_commerce_plans(
    include_inactive: bool = Query(default=False, alias="includeInactive"),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[CommercePlanCatalogOut]:
    items = await build_commerce_service(settings).list_plans(include_inactive=include_inactive)
    return ApiResponse.success(
        data=CommercePlanCatalogOut(
            billing_provider=settings.billing.provider,
            checkout_enabled=settings.billing.checkout_enabled,
            items=items,
        )
    )


@router.put(
    "/plans/{code}",
    response_model=ResponseModel[CommercePlanOut],
    summary="Create or update a commerce plan",
)
async def upsert_commerce_plan(
    code: PlanCode,
    payload: CommercePlanUpsertRequest,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[CommercePlanOut]:
    plan = await build_commerce_service(settings).upsert_plan(code=code, payload=payload)
    return ApiResponse.success(message=t("commerce", "API_PLAN_SAVED"), data=plan)


@router.put(
    "/workspaces/{workspace_id}/subscription",
    response_model=ResponseModel[WorkspaceCommerceOverviewOut],
    summary="Set workspace subscription",
)
async def set_workspace_subscription(
    workspace_id: PublicUUID,
    payload: WorkspaceSubscriptionSetRequest,
    actor: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceCommerceOverviewOut]:
    overview = await build_commerce_service(settings).set_workspace_subscription(
        workspace_id=workspace_id,
        actor_user_id=actor.id,
        payload=payload,
    )
    return ApiResponse.success(message=t("commerce", "API_WORKSPACE_PLAN_UPDATED"), data=overview)
