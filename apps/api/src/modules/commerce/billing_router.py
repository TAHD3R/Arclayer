from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request

from src.config import Settings, get_settings
from src.core.extensions.dependencies import get_connector_registry
from src.core.http.response import ApiResponse, ResponseModel
from src.core.registries import ConnectorRegistry
from src.modules.commerce.billing_event_acceptance_service import build_billing_event_acceptance_service

router = APIRouter(tags=["domain.commerce.billing"])


@router.post(
    "/webhooks/stripe",
    response_model=ResponseModel[None],
    summary="Receive signed Stripe subscription events",
)
async def receive_stripe_webhook(
    request: Request,
    stripe_signature: str = Header(alias="Stripe-Signature"),
    settings: Settings = Depends(get_settings),
    connector_registry: ConnectorRegistry = Depends(get_connector_registry),
) -> ResponseModel[None]:
    payload = await request.body()
    await build_billing_event_acceptance_service(
        settings,
        connector_registry,
        provider_name="stripe",
    ).accept(
        payload=payload,
        signature=stripe_signature,
    )
    return ApiResponse.success(data=None)
