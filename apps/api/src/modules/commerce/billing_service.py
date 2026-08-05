from __future__ import annotations

import hashlib
import json
from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.core.services.base import BaseService
from src.models.commerce.billing import (
    BillingCycle,
    CommercePlanRevision,
    CommercePlanRevisionPrice,
    PlanRevisionStatus,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.modules.commerce.billing_connector import BillingConnector, build_billing_operation_idempotency_key
from src.modules.commerce.checkout_session_repository import TortoiseCheckoutSessionRepository
from src.modules.commerce.schema import BillingRedirectOut, CheckoutSessionCreate
from src.modules.commerce.service import build_commerce_service
from src.modules.commerce.simulated_checkout_service import SimulatedCheckoutRequest, SimulatedCheckoutService


class BillingCheckoutSelection(BaseSchema):
    """Provider checkout facts pinned to one published Plan Revision Price."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    plan_code: str = Field(min_length=1, max_length=48)
    plan_id: UUID
    plan_revision_id: UUID
    external_price_id: str = Field(min_length=1, max_length=255)
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(gt=0)


class BillingCheckoutReader(Protocol):
    async def get_published_checkout_selection(
        self,
        *,
        plan_code: str,
        provider: str,
        provider_mode: str,
        billing_cycle: BillingCycle,
    ) -> BillingCheckoutSelection | None: ...

    async def list_checkout_revision_ids(
        self,
        *,
        revision_ids: set[UUID],
        provider: str,
        provider_mode: str,
    ) -> set[UUID]: ...


class BillingCheckoutCatalogReader:
    """Read-only checkout projection that never dereferences a latest revision later."""

    async def get_published_checkout_selection(
        self,
        *,
        plan_code: str,
        provider: str,
        provider_mode: str,
        billing_cycle: BillingCycle,
    ) -> BillingCheckoutSelection | None:
        revision = await CommercePlanRevision.filter(
            plan__code=plan_code,
            plan__is_active=True,
            status=PlanRevisionStatus.PUBLISHED,
            is_selling=True,
        ).first()
        if revision is None:
            return None
        price = await CommercePlanRevisionPrice.filter(
            plan_revision_id=revision.id,
            provider=provider,
            provider_mode=provider_mode,
            billing_cycle=billing_cycle,
            currency=revision.currency,
        ).first()
        if price is None:
            return None
        return BillingCheckoutSelection(
            plan_code=plan_code,
            plan_id=revision.plan_id,
            plan_revision_id=revision.id,
            external_price_id=price.external_price_id,
            currency=price.currency,
            amount_micros=price.amount_micros,
        )

    async def list_checkout_revision_ids(
        self,
        *,
        revision_ids: set[UUID],
        provider: str,
        provider_mode: str,
    ) -> set[UUID]:
        if not revision_ids:
            return set()
        rows = await CommercePlanRevisionPrice.filter(
            plan_revision_id__in=revision_ids,
            provider=provider,
            provider_mode=provider_mode,
        ).values_list("plan_revision_id", flat=True)
        return {UUID(str(revision_id)) for revision_id in rows}


class WorkspaceBillingReader(Protocol):
    async def ensure_workspace_billing(
        self,
        *,
        workspace_id: UUID,
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlanRevision]: ...


class SimulatedCheckoutCreator(Protocol):
    async def create(self, *, request: SimulatedCheckoutRequest) -> BillingRedirectOut: ...


class BillingService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        provider: BillingConnector,
        provider_name: str,
        plans: BillingCheckoutReader,
        commerce: WorkspaceBillingReader,
        simulated_checkouts: SimulatedCheckoutCreator,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._provider = provider
        self._provider_name = provider_name
        self._plans = plans
        self._commerce = commerce
        self._simulated_checkouts = simulated_checkouts

    async def list_checkout_revision_ids(self, *, revision_ids: set[UUID]) -> set[UUID]:
        return await self._plans.list_checkout_revision_ids(
            revision_ids=revision_ids,
            provider=self._provider_name,
            provider_mode=self._provider.provider_mode,
        )

    async def create_checkout(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: CheckoutSessionCreate,
    ) -> BillingRedirectOut:
        caller_idempotency_key = idempotency_key.strip()
        if not caller_idempotency_key:
            raise BadRequest(error="BILLING_CHECKOUT_IDEMPOTENCY_KEY_INVALID")
        subscription, _, current_revision = await self._commerce.ensure_workspace_billing(workspace_id=workspace_id)
        selection = await self._plans.get_published_checkout_selection(
            plan_code=payload.plan_code,
            provider=self._provider_name,
            provider_mode=self._provider.provider_mode,
            billing_cycle=payload.billing_interval,
        )
        if selection is None:
            raise BadRequest(error="COMMERCE_PLAN_NOT_FOUND")
        if (
            selection.plan_revision_id == subscription.plan_revision_id
            and payload.billing_interval == subscription.billing_cycle
        ):
            raise BadRequest(error="COMMERCE_PLAN_ALREADY_ACTIVE")
        admin_url = self._settings.saas.admin_url.rstrip("/")
        provider_idempotency_key = build_billing_operation_idempotency_key(
            operation="checkout",
            business_identity=(str(workspace_id), str(actor_user_id), caller_idempotency_key),
        )
        request_fingerprint = _checkout_request_fingerprint(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            subscription_id=subscription.id,
            current_plan_revision_id=current_revision.id,
            selection=selection,
            billing_cycle=payload.billing_interval,
        )
        if self._provider_name == "simulated":
            return await self._simulated_checkouts.create(
                request=SimulatedCheckoutRequest(
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    subscription_id=subscription.id,
                    plan_code=selection.plan_code,
                    plan_id=selection.plan_id,
                    plan_revision_id=selection.plan_revision_id,
                    external_price_id=selection.external_price_id,
                    billing_cycle=payload.billing_interval,
                    currency=selection.currency,
                    amount_micros=selection.amount_micros,
                    provider_idempotency_key=provider_idempotency_key,
                    request_fingerprint=request_fingerprint,
                    success_url=f"{admin_url}/?billing=success",
                    cancel_url=f"{admin_url}/?billing=canceled",
                )
            )
        session = await self._provider.create_checkout_session(
            workspace_id=str(workspace_id),
            plan_code=selection.plan_code,
            plan_id=str(selection.plan_id),
            plan_revision_id=str(selection.plan_revision_id),
            external_price_id=selection.external_price_id,
            billing_cycle=str(payload.billing_interval),
            currency=selection.currency,
            success_url=f"{admin_url}/?billing=success",
            cancel_url=f"{admin_url}/?billing=canceled",
            customer_id=subscription.external_customer_id,
            idempotency_key=provider_idempotency_key,
        )
        return BillingRedirectOut(url=session.url)

    async def create_portal(self, *, workspace_id: UUID) -> BillingRedirectOut:
        subscription, _, current_revision = await self._commerce.ensure_workspace_billing(workspace_id=workspace_id)
        if not subscription.external_customer_id:
            raise BadRequest(error="BILLING_CUSTOMER_NOT_FOUND")
        session = await self._provider.create_portal_session(
            customer_id=subscription.external_customer_id,
            return_url=self._settings.saas.admin_url.rstrip("/"),
            idempotency_key=build_billing_operation_idempotency_key(
                operation="portal",
                business_identity=(
                    str(workspace_id),
                    str(subscription.id),
                    str(current_revision.id),
                    subscription.external_customer_id,
                ),
            ),
        )
        return BillingRedirectOut(url=session.url)


def build_billing_service(settings: Settings, connector_registry: ConnectorRegistry) -> BillingService:
    billing = settings.billing
    if billing.provider == "disabled":
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_CONFIGURED")
    registration = connector_registry.resolve(f"billing.{billing.provider}")
    if registration is None:
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_SUPPORTED")
    connector = registration.factory()
    if not isinstance(connector, BillingConnector):
        raise ServiceUnavailable(error="BILLING_CONNECTOR_INVALID")
    return BillingService(
        settings=settings,
        provider=connector,
        provider_name=billing.provider,
        plans=BillingCheckoutCatalogReader(),
        commerce=build_commerce_service(settings),
        simulated_checkouts=SimulatedCheckoutService(
            settings=settings,
            provider=connector,
            repository=TortoiseCheckoutSessionRepository(),
        ),
    )


def _checkout_request_fingerprint(
    *,
    workspace_id: UUID,
    actor_user_id: UUID,
    subscription_id: UUID,
    current_plan_revision_id: UUID,
    selection: BillingCheckoutSelection,
    billing_cycle: BillingCycle,
) -> str:
    payload = {
        "actor_user_id": str(actor_user_id),
        "billing_cycle": str(billing_cycle),
        "current_plan_revision_id": str(current_plan_revision_id),
        "selection": selection.model_dump(mode="json"),
        "subscription_id": str(subscription_id),
        "workspace_id": str(workspace_id),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()
