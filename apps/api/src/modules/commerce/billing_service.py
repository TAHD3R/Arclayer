from __future__ import annotations

from uuid import UUID

from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.core.services.base import BaseService
from src.models.commerce.billing import BillingCycle, CommercePlan
from src.modules.commerce.billing_connector import BillingConnector
from src.modules.commerce.schema import BillingRedirectOut, CheckoutSessionCreate
from src.modules.commerce.service import CommerceService


class BillingService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        provider: BillingConnector,
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


def build_billing_service(settings: Settings, connector_registry: ConnectorRegistry) -> BillingService:
    billing = settings.billing
    if not billing.checkout_enabled:
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_CONFIGURED")
    registration = connector_registry.resolve(f"billing.{billing.provider}")
    if registration is None:
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_SUPPORTED")
    connector = registration.factory()
    if not isinstance(connector, BillingConnector):
        raise ServiceUnavailable(error="BILLING_CONNECTOR_INVALID")
    return BillingService(settings=settings, provider=connector)
