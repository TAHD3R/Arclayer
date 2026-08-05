from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.pagination import PageData, PageParams, get_page_params
from src.core.http.response import ApiResponse, ResponseModel
from src.core.registries import ConnectorRegistry
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.authorization import require_workspace_commerce_manage_access
from src.modules.commerce.billing_service import build_billing_service
from src.modules.commerce.schema import (
    BillingRedirectOut,
    CheckoutSessionCreate,
    CommercePlanRevisionOut,
    CreditLedgerOut,
    WorkspaceCommerceOverviewOut,
    WorkspacePlanCatalogOut,
    WorkspacePlanOptionOut,
)
from src.modules.commerce.service import build_commerce_service
from src.modules.commerce.simulated_checkout_outcome_service import (
    SimulatedCheckoutOutcomeOut,
    SimulatedCheckoutOutcomeWrite,
    build_simulated_checkout_outcome_service,
)
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_member_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/commerce",
    tags=["domain.commerce"],
)

ActorUserId = Annotated[UUID, Depends(get_current_user_id)]
IdempotencyKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]


@router.get(
    "/plans",
    response_model=ResponseModel[WorkspacePlanCatalogOut],
    summary="List selectable workspace plans",
)
async def list_workspace_plans(
    ctx: WorkspaceContext = Depends(require_workspace_member_access),
    settings: Settings = Depends(get_settings),
    connector_registry: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[WorkspacePlanCatalogOut]:
    service = build_commerce_service(settings)
    subscription, _, _ = await service.ensure_workspace_billing(workspace_id=ctx.workspace_id)
    plans = await service.list_selling_revisions(include_inactive=False)
    checkout_revision_ids = await _checkout_revision_ids(
        plans=plans,
        settings=settings,
        connector_registry=connector_registry,
    )
    items = [
        WorkspacePlanOptionOut(
            **plan.model_dump(),
            is_current=plan.id == subscription.plan_revision_id,
            can_select=plan.id != subscription.plan_revision_id and plan.id in checkout_revision_ids,
        )
        for plan in plans
    ]
    return ApiResponse.success(
        data=WorkspacePlanCatalogOut(
            billing_provider=settings.billing.provider,
            checkout_enabled=bool(checkout_revision_ids),
            items=items,
        )
    )


async def _checkout_revision_ids(
    *,
    plans: list[CommercePlanRevisionOut],
    settings: Settings,
    connector_registry: ConnectorRegistry,
) -> set[UUID]:
    if settings.billing.provider == "disabled":
        return set()
    billing_service = build_billing_service(settings, connector_registry)
    return await billing_service.list_checkout_revision_ids(revision_ids={plan.id for plan in plans})


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
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    ctx: WorkspaceContext = Depends(require_workspace_commerce_manage_access),
    settings: Settings = Depends(get_settings),
    connector_registry: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[BillingRedirectOut]:
    redirect = await build_billing_service(settings, connector_registry).create_checkout(
        workspace_id=ctx.workspace_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=redirect)


@router.post(
    "/checkout-session/{checkout_session_id}/outcome",
    response_model=ResponseModel[SimulatedCheckoutOutcomeOut],
    summary="Submit a simulated Checkout outcome",
)
async def create_simulated_checkout_outcome(
    checkout_session_id: PublicUUID,
    payload: SimulatedCheckoutOutcomeWrite,
    actor_user_id: ActorUserId,
    idempotency_key: IdempotencyKey,
    ctx: WorkspaceContext = Depends(require_workspace_commerce_manage_access),
    settings: Settings = Depends(get_settings),
    connector_registry: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[SimulatedCheckoutOutcomeOut]:
    result = await build_simulated_checkout_outcome_service(settings, connector_registry).create(
        workspace_id=ctx.workspace_id,
        checkout_session_id=checkout_session_id,
        actor_user_id=actor_user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=result)


@router.post(
    "/customer-portal-session",
    response_model=ResponseModel[BillingRedirectOut],
    summary="Create a provider-hosted customer portal session",
)
async def create_workspace_customer_portal_session(
    ctx: WorkspaceContext = Depends(require_workspace_commerce_manage_access),
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
    ctx: WorkspaceContext = Depends(require_workspace_commerce_manage_access),
    params: PageParams = Depends(get_page_params),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[PageData[CreditLedgerOut]]:
    page = await build_commerce_service(settings).list_credit_ledger(workspace_id=ctx.workspace_id, params=params)
    return ApiResponse.success(data=page)
