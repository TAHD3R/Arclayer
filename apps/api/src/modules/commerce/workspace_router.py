from __future__ import annotations

from fastapi import APIRouter, Depends

from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.registries import ConnectorRegistry
from src.modules.commerce.billing_service import build_billing_service
from src.modules.commerce.schema import (
    BillingRedirectOut,
    CheckoutSessionCreate,
    CreditLedgerOut,
    WorkspaceCommerceOverviewOut,
    WorkspacePlanCatalogOut,
    WorkspacePlanOptionOut,
)
from src.modules.commerce.service import build_commerce_service
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
    service = build_commerce_service(settings)
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
    return ApiResponse.success(
        data=WorkspacePlanCatalogOut(
            billing_provider=settings.billing.provider,
            checkout_enabled=settings.billing.checkout_enabled,
            items=items,
        )
    )


@router.get(
    "/overview",
    response_model=ResponseModel[WorkspaceCommerceOverviewOut],
    summary="Get workspace commerce overview",
)
async def get_workspace_commerce_overview(
    ctx: WorkspaceContext = Depends(require_workspace_member_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceCommerceOverviewOut]:
    overview = await build_commerce_service(settings).get_overview(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=overview)


@router.post(
    "/checkout-session",
    response_model=ResponseModel[BillingRedirectOut],
    summary="Create a provider-hosted checkout session",
)
async def create_workspace_checkout_session(
    payload: CheckoutSessionCreate,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
    connector_registry: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[BillingRedirectOut]:
    redirect = await build_billing_service(settings, connector_registry).create_checkout(
        workspace_id=ctx.workspace_id,
        payload=payload,
    )
    return ApiResponse.success(data=redirect)


@router.post(
    "/customer-portal-session",
    response_model=ResponseModel[BillingRedirectOut],
    summary="Create a provider-hosted customer portal session",
)
async def create_workspace_customer_portal_session(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
    connector_registry: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[BillingRedirectOut]:
    redirect = await build_billing_service(settings, connector_registry).create_portal(workspace_id=ctx.workspace_id)
    return ApiResponse.success(data=redirect)


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
    page = await build_commerce_service(settings).list_credit_ledger(workspace_id=ctx.workspace_id, params=params)
    return ApiResponse.success(data=page)
