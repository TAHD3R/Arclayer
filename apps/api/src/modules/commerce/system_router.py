from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.commerce.billing import SubscriptionChangeRequestStatus
from src.models.organization.user import User
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.commerce.schema import (
    CommercePlanCatalogOut,
    CommercePlanOut,
    CommercePlanUpsertRequest,
    PlanCode,
    SubscriptionChangeRequestOut,
    SubscriptionChangeRequestReject,
    SubscriptionChangeRequestReview,
    WorkspaceCommerceOverviewOut,
    WorkspaceSubscriptionSetRequest,
)
from src.modules.commerce.service import CommerceService

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
    items = await CommerceService(settings).list_plans(include_inactive=include_inactive)
    return ApiResponse.success(data=CommercePlanCatalogOut(items=items))


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
    plan = await CommerceService(settings).upsert_plan(code=code, payload=payload)
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
    overview = await CommerceService(settings).set_workspace_subscription(
        workspace_id=workspace_id,
        actor_user_id=actor.id,
        payload=payload,
    )
    return ApiResponse.success(message=t("commerce", "API_WORKSPACE_PLAN_UPDATED"), data=overview)


@router.get(
    "/subscription-change-requests",
    response_model=ResponseModel[PageData[SubscriptionChangeRequestOut]],
    summary="List workspace subscription change requests",
)
async def list_subscription_change_requests(
    request_status: SubscriptionChangeRequestStatus | None = Query(default=None, alias="status"),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[SubscriptionChangeRequestOut]]:
    page = await CommerceService(settings).list_change_requests(params=params, status=request_status)
    return ApiResponse.success(data=page)


@router.post(
    "/subscription-change-requests/{request_id}/approve",
    response_model=ResponseModel[SubscriptionChangeRequestOut],
    summary="Approve a workspace subscription change request",
)
async def approve_subscription_change_request(
    request_id: PublicUUID,
    payload: SubscriptionChangeRequestReview,
    actor: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[SubscriptionChangeRequestOut]:
    row = await CommerceService(settings).approve_change_request(
        request_id=request_id,
        actor_user_id=actor.id,
        review_note=payload.review_note,
    )
    return ApiResponse.success(message=t("commerce", "API_CHANGE_REQUEST_APPROVED"), data=row)


@router.post(
    "/subscription-change-requests/{request_id}/reject",
    response_model=ResponseModel[SubscriptionChangeRequestOut],
    summary="Reject a workspace subscription change request",
)
async def reject_subscription_change_request(
    request_id: PublicUUID,
    payload: SubscriptionChangeRequestReject,
    actor: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[SubscriptionChangeRequestOut]:
    row = await CommerceService(settings).reject_change_request(
        request_id=request_id,
        actor_user_id=actor.id,
        review_note=payload.review_note,
    )
    return ApiResponse.success(message=t("commerce", "API_CHANGE_REQUEST_REJECTED"), data=row)
