from __future__ import annotations

from fastapi import APIRouter, Depends, status

from src.config import Settings, get_settings
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.organization.user import User
from src.modules.auth.http.service import get_current_user
from src.modules.commerce.schema import (
    CreditLedgerOut,
    SubscriptionChangeRequestCreate,
    SubscriptionChangeRequestOut,
    WorkspaceCommerceOverviewOut,
    WorkspacePlanCatalogOut,
    WorkspacePlanOptionOut,
)
from src.modules.commerce.service import CommerceService
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access, require_workspace_member_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/commerce",
    tags=["domain.commerce"],
)


@router.get(
    "/plans",
    response_model=ResponseModel[WorkspacePlanCatalogOut],
    summary="List selectable workspace plans",
)
async def list_workspace_plans(
    ctx: WorkspaceContext = Depends(require_workspace_member_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspacePlanCatalogOut]:
    service = CommerceService(settings)
    _, _, current_plan = await service.ensure_workspace_billing(workspace_id=ctx.workspace_id)
    plans = await service.list_plans(include_inactive=False)
    items = [
        WorkspacePlanOptionOut(
            **plan.model_dump(),
            is_current=plan.id == current_plan.id,
            can_select=plan.id != current_plan.id,
        )
        for plan in plans
    ]
    return ApiResponse.success(data=WorkspacePlanCatalogOut(items=items))


@router.get(
    "/overview",
    response_model=ResponseModel[WorkspaceCommerceOverviewOut],
    summary="Get workspace commerce overview",
)
async def get_workspace_commerce_overview(
    ctx: WorkspaceContext = Depends(require_workspace_member_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceCommerceOverviewOut]:
    overview = await CommerceService(settings).get_overview(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=overview)


@router.get(
    "/credits/ledger",
    response_model=ResponseModel[PageData[CreditLedgerOut]],
    summary="List workspace credit ledger",
)
async def list_workspace_credit_ledger(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[CreditLedgerOut]]:
    page = await CommerceService(settings).list_credit_ledger(workspace_id=ctx.workspace_id, params=params)
    return ApiResponse.success(data=page)


@router.post(
    "/subscription-change-requests",
    response_model=ResponseModel[SubscriptionChangeRequestOut],
    status_code=status.HTTP_201_CREATED,
    summary="Request a workspace plan change",
)
async def create_workspace_subscription_change_request(
    payload: SubscriptionChangeRequestCreate,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[SubscriptionChangeRequestOut]:
    row = await CommerceService(settings).create_change_request(
        workspace_id=ctx.workspace_id,
        actor_user_id=user.id,
        payload=payload,
    )
    return ApiResponse.success(message=t("commerce", "API_CHANGE_REQUEST_SUBMITTED"), data=row)
