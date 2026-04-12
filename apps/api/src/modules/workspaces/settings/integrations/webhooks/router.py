from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from src.config import Settings, get_settings
from src.core.http.response import Response, ResponseModel
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access
from src.modules.workspaces.settings.integrations.webhooks.schema import (
    WebhookDeliveryListOut,
    WebhookSubscriptionCreateIn,
    WebhookSubscriptionListOut,
    WebhookSubscriptionOut,
)
from src.modules.workspaces.settings.integrations.webhooks.service import WebhooksService

router = APIRouter(
    prefix="/integrations/webhooks",
    tags=["Workspace Integrations: Webhooks"],
)


def get_service(settings: Settings = Depends(get_settings)) -> WebhooksService:
    return WebhooksService(settings)


@router.get(
    "",
    response_model=ResponseModel[WebhookSubscriptionListOut],
    summary="List workspace webhook subscriptions",
    dependencies=[require_workspace_permission("system:settings:read")],
)
async def list_webhook_subscriptions(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: WebhooksService = Depends(get_service),
) -> ResponseModel[WebhookSubscriptionListOut]:
    items = await service.list_subscriptions_out(workspace_id=ctx.workspace_id)
    return Response.success(data=WebhookSubscriptionListOut(items=items))


@router.post(
    "",
    response_model=ResponseModel[WebhookSubscriptionOut],
    summary="Create a webhook subscription",
    dependencies=[require_workspace_permission("system:settings:manage")],
)
async def create_webhook_subscription(
    payload: WebhookSubscriptionCreateIn,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: WebhooksService = Depends(get_service),
) -> ResponseModel[WebhookSubscriptionOut]:
    out = await service.create_subscription_out(
        workspace_id=ctx.workspace_id,
        capability_id=payload.capability_id,
        event=payload.event,
        endpoint_url=str(payload.endpoint_url),
        enabled=payload.enabled,
        secret=payload.secret,
    )
    return Response.success(data=out)


@router.get(
    "/deliveries",
    response_model=ResponseModel[WebhookDeliveryListOut],
    summary="List recent webhook deliveries (delivery log)",
    dependencies=[require_workspace_permission("system:settings:read")],
)
async def list_webhook_deliveries(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    service: WebhooksService = Depends(get_service),
    limit: int = Query(default=50, ge=1, le=200),
) -> ResponseModel[WebhookDeliveryListOut]:
    items = await service.list_deliveries_out(workspace_id=ctx.workspace_id, limit=limit)
    return Response.success(data=WebhookDeliveryListOut(items=items))
