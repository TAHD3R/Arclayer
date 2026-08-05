from __future__ import annotations

from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.services.base import BaseService
from src.models.commerce.billing import BillingCycle
from src.modules.commerce.billing_connector import BillingConnector
from src.modules.commerce.checkout_session_repository import (
    CheckoutSessionRecord,
    SimulatedCheckoutCreate,
)
from src.modules.commerce.schema import BillingRedirectOut


class SimulatedCheckoutRequest(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    actor_user_id: UUID
    subscription_id: UUID
    plan_code: str = Field(..., min_length=1, max_length=48)
    plan_id: UUID
    plan_revision_id: UUID
    external_price_id: str = Field(..., min_length=1, max_length=255)
    billing_cycle: BillingCycle
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(..., gt=0)
    provider_idempotency_key: str = Field(..., min_length=1, max_length=160)
    request_fingerprint: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    success_url: str = Field(..., min_length=1)
    cancel_url: str = Field(..., min_length=1)


class SimulatedCheckoutStore(Protocol):
    async def lock_idempotency_scope(
        self,
        *,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def require_replay(
        self,
        *,
        idempotency_key: str,
        request_fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> CheckoutSessionRecord | None: ...

    async def create_simulated_checkout(
        self,
        *,
        settings: Settings,
        command: SimulatedCheckoutCreate,
        conn: BaseDBAsyncClient,
    ) -> CheckoutSessionRecord: ...


class SimulatedCheckoutService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        provider: BillingConnector,
        repository: SimulatedCheckoutStore,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._provider = provider
        self._repository = repository

    async def create(self, *, request: SimulatedCheckoutRequest) -> BillingRedirectOut:
        async with self.tx() as conn:
            await self._repository.lock_idempotency_scope(
                idempotency_key=request.provider_idempotency_key,
                conn=conn,
            )
            replay = await self._repository.require_replay(
                idempotency_key=request.provider_idempotency_key,
                request_fingerprint=request.request_fingerprint,
                conn=conn,
            )
            if replay is not None:
                return BillingRedirectOut(url=replay.checkout_url)
            session = await self._provider.create_checkout_session(
                workspace_id=str(request.workspace_id),
                plan_code=request.plan_code,
                plan_id=str(request.plan_id),
                plan_revision_id=str(request.plan_revision_id),
                external_price_id=request.external_price_id,
                billing_cycle=str(request.billing_cycle),
                currency=request.currency,
                success_url=request.success_url,
                cancel_url=request.cancel_url,
                customer_id=None,
                idempotency_key=request.provider_idempotency_key,
            )
            checkout = await self._repository.create_simulated_checkout(
                settings=self._settings,
                command=SimulatedCheckoutCreate(
                    workspace_id=request.workspace_id,
                    subscription_id=request.subscription_id,
                    target_plan_revision_id=request.plan_revision_id,
                    plan_code=request.plan_code,
                    provider_account_id=session.provider_account_id,
                    billing_cycle=request.billing_cycle,
                    currency=request.currency,
                    amount_micros=request.amount_micros,
                    external_price_id=request.external_price_id,
                    external_session_id=session.external_session_id,
                    checkout_url=session.url,
                    idempotency_key=request.provider_idempotency_key,
                    request_fingerprint=request.request_fingerprint,
                    actor_user_id=request.actor_user_id,
                    expires_at=session.expires_at,
                ),
                conn=conn,
            )
            return BillingRedirectOut(url=checkout.checkout_url)
