from __future__ import annotations

from uuid import UUID

from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.services.base import BaseService
from src.models.commerce.billing import BillingCycle, CommercePlan, SubscriptionStatus
from src.modules.commerce.billing_provider import BillingProvider
from src.modules.commerce.schema import BillingRedirectOut, CheckoutSessionCreate
from src.modules.commerce.service import CommerceService

_STRIPE_STATUS_MAP = {
    "trialing": SubscriptionStatus.TRIALING,
    "active": SubscriptionStatus.ACTIVE,
    "past_due": SubscriptionStatus.PAST_DUE,
    "unpaid": SubscriptionStatus.PAST_DUE,
    "paused": SubscriptionStatus.PAST_DUE,
    "canceled": SubscriptionStatus.CANCELED,
    "incomplete": SubscriptionStatus.PAST_DUE,
    "incomplete_expired": SubscriptionStatus.CANCELED,
}


class BillingService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        provider: BillingProvider,
        commerce: CommerceService | None = None,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._provider = provider
        self._commerce = commerce or CommerceService(settings)

    async def create_checkout(
        self,
        *,
        workspace_id: UUID,
        payload: CheckoutSessionCreate,
    ) -> BillingRedirectOut:
        subscription, _, current_plan = await self._commerce.ensure_workspace_billing(workspace_id=workspace_id)
        plan = await CommercePlan.get_or_none(code=payload.plan_code, is_active=True)
        if plan is None:
            raise BadRequest(error="COMMERCE_PLAN_NOT_FOUND")
        if plan.id == current_plan.id and payload.billing_interval == subscription.billing_cycle:
            raise BadRequest(error="COMMERCE_PLAN_ALREADY_ACTIVE")
        amount_micros = (
            int(plan.price_monthly_micros)
            if payload.billing_interval == BillingCycle.MONTHLY
            else int(plan.price_yearly_micros)
        )
        admin_url = self._settings.saas.admin_url.rstrip("/")
        session = await self._provider.create_checkout_session(
            workspace_id=str(workspace_id),
            plan_code=plan.code,
            plan_name=plan.name,
            billing_cycle=str(payload.billing_interval),
            currency=plan.currency,
            amount_micros=amount_micros,
            success_url=f"{admin_url}/?billing=success",
            cancel_url=f"{admin_url}/?billing=canceled",
            customer_id=subscription.external_customer_id,
        )
        return BillingRedirectOut(url=session.url)

    async def create_portal(self, *, workspace_id: UUID) -> BillingRedirectOut:
        subscription, _, _ = await self._commerce.ensure_workspace_billing(workspace_id=workspace_id)
        if not subscription.external_customer_id:
            raise BadRequest(error="BILLING_CUSTOMER_NOT_FOUND")
        session = await self._provider.create_portal_session(
            customer_id=subscription.external_customer_id,
            return_url=self._settings.saas.admin_url.rstrip("/"),
        )
        return BillingRedirectOut(url=session.url)

    async def handle_webhook(self, *, payload: bytes, signature: str) -> None:
        provider_subscription = await self._provider.subscription_from_webhook(
            payload=payload,
            signature=signature,
        )
        if provider_subscription is None:
            return
        try:
            workspace_id = UUID(provider_subscription.workspace_id)
            billing_cycle = BillingCycle(provider_subscription.billing_cycle)
            status = _STRIPE_STATUS_MAP[provider_subscription.status]
        except (ValueError, KeyError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc
        await self._commerce.apply_provider_subscription(
            workspace_id=workspace_id,
            plan_code=provider_subscription.plan_code,
            status=status,
            billing_interval=billing_cycle,
            current_period_start=provider_subscription.current_period_start,
            current_period_end=provider_subscription.current_period_end,
            cancel_at_period_end=provider_subscription.cancel_at_period_end,
            provider="stripe",
            external_customer_id=provider_subscription.customer_id,
            external_subscription_id=provider_subscription.subscription_id,
            event_id=provider_subscription.event_id,
        )


def build_billing_service(settings: Settings) -> BillingService:
    billing = settings.billing
    if not billing.checkout_enabled:
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_CONFIGURED")
    if billing.provider != "stripe":
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_SUPPORTED")
    from src.modules.commerce.billing_provider import StripeBillingProvider

    provider = StripeBillingProvider(
        secret_key=billing.stripe_secret_key.get_secret_value(),
        webhook_secret=billing.stripe_webhook_secret.get_secret_value(),
        api_base_url=billing.stripe_api_base_url,
        webhook_tolerance_seconds=billing.webhook_tolerance_seconds,
    )
    return BillingService(settings=settings, provider=provider)
