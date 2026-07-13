from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.commerce.billing_service import build_billing_service

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
) -> ResponseModel[None]:
    payload = await request.body()
    await build_billing_service(settings).handle_webhook(
        payload=payload,
        signature=stripe_signature,
    )
    return ApiResponse.success(data=None)
