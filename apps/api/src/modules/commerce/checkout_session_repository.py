from __future__ import annotations

from uuid import UUID

from pydantic import AwareDatetime, ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import BillingCycle, BillingProviderMode
from src.models.commerce.payments import (
    CommerceCheckoutKind,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event

_CHECKOUT_LOCK_NAMESPACE = "arclayer:commerce:checkout"


class SimulatedCheckoutCreate(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    subscription_id: UUID
    target_plan_revision_id: UUID
    plan_code: str = Field(..., min_length=1, max_length=48)
    provider_account_id: str = Field(..., min_length=1, max_length=255)
    billing_cycle: BillingCycle
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(..., gt=0)
    external_price_id: str = Field(..., min_length=1, max_length=255)
    external_session_id: str = Field(..., min_length=1, max_length=255)
    checkout_url: str = Field(..., min_length=1)
    idempotency_key: str = Field(..., min_length=1, max_length=160)
    request_fingerprint: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    actor_user_id: UUID
    expires_at: AwareDatetime


class CheckoutSessionRecord(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: UUID
    workspace_id: UUID
    subscription_id: UUID
    target_plan_revision_id: UUID
    plan_code: str
    provider: str
    provider_mode: BillingProviderMode
    provider_account_id: str
    status: CommerceCheckoutStatus
    billing_cycle: BillingCycle
    currency: str
    amount_micros: int
    external_price_id: str
    external_session_id: str
    checkout_url: str
    idempotency_key: str
    request_fingerprint: str
    actor_user_id: UUID
    expires_at: AwareDatetime
    revision: int


class TortoiseCheckoutSessionRepository(TortoiseORMRepository[CommerceCheckoutSession]):
    def __init__(self) -> None:
        super().__init__(CommerceCheckoutSession)

    async def lock_idempotency_scope(self, *, idempotency_key: str, conn: BaseDBAsyncClient) -> None:
        await conn.execute_query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [f"{_CHECKOUT_LOCK_NAMESPACE}:{idempotency_key}"],
        )

    async def require_replay(
        self,
        *,
        idempotency_key: str,
        request_fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> CheckoutSessionRecord | None:
        checkout = await (
            CommerceCheckoutSession.filter(idempotency_key=idempotency_key).using_db(conn).select_for_update().first()
        )
        if checkout is None:
            return None
        if checkout.request_fingerprint != request_fingerprint:
            raise Conflict(error="BILLING_CHECKOUT_IDEMPOTENCY_CONFLICT")
        return _checkout_record(checkout)

    async def create_simulated_checkout(
        self,
        *,
        settings: Settings,
        command: SimulatedCheckoutCreate,
        conn: BaseDBAsyncClient,
    ) -> CheckoutSessionRecord:
        checkout = await CommerceCheckoutSession.create(
            using_db=conn,
            workspace_id=command.workspace_id,
            subscription_id=command.subscription_id,
            target_plan_revision_id=command.target_plan_revision_id,
            top_up_offer_id=None,
            plan_code=command.plan_code,
            provider="simulated",
            provider_mode=BillingProviderMode.TEST,
            provider_account_id=command.provider_account_id,
            kind=CommerceCheckoutKind.SUBSCRIPTION,
            status=CommerceCheckoutStatus.PENDING,
            billing_cycle=command.billing_cycle,
            currency=command.currency,
            amount_micros=command.amount_micros,
            credit_amount=None,
            external_price_id=command.external_price_id,
            external_session_id=command.external_session_id,
            checkout_url=command.checkout_url,
            idempotency_key=command.idempotency_key,
            request_fingerprint=command.request_fingerprint,
            actor_user_id=command.actor_user_id,
            expires_at=command.expires_at,
            completed_at=None,
            revision=1,
        )
        await write_required_activity_event(
            settings=settings,
            payload=ActivityAuditPayload(
                event_name="commerce.simulated_checkout.created",
                actor_user_id=command.actor_user_id,
                workspace_id=command.workspace_id,
                entity_type="commerce_checkout_session",
                entity_id=checkout.id,
                source="api",
                properties={
                    "plan_code": command.plan_code,
                    "plan_revision_id": str(command.target_plan_revision_id),
                    "provider": "simulated",
                    "provider_mode": "test",
                    "provider_account_id": command.provider_account_id,
                    "external_price_id": command.external_price_id,
                    "external_session_id": command.external_session_id,
                    "billing_cycle": str(command.billing_cycle),
                    "currency": command.currency,
                    "amount_micros": command.amount_micros,
                    "idempotency_key_hash": command.idempotency_key,
                    "request_fingerprint": command.request_fingerprint,
                },
            ),
            conn=conn,
        )
        return _checkout_record(checkout)


def _checkout_record(checkout: CommerceCheckoutSession) -> CheckoutSessionRecord:
    if (
        checkout.subscription_id is None
        or checkout.target_plan_revision_id is None
        or checkout.plan_code is None
        or checkout.billing_cycle is None
        or checkout.provider != "simulated"
        or checkout.kind != CommerceCheckoutKind.SUBSCRIPTION
    ):
        raise ServiceUnavailable(error="BILLING_CHECKOUT_EVIDENCE_INVALID")
    return CheckoutSessionRecord(
        id=checkout.id,
        workspace_id=checkout.workspace_id,
        subscription_id=checkout.subscription_id,
        target_plan_revision_id=checkout.target_plan_revision_id,
        plan_code=checkout.plan_code,
        provider=checkout.provider,
        provider_mode=checkout.provider_mode,
        provider_account_id=checkout.provider_account_id,
        status=checkout.status,
        billing_cycle=checkout.billing_cycle,
        currency=checkout.currency,
        amount_micros=checkout.amount_micros,
        external_price_id=checkout.external_price_id,
        external_session_id=checkout.external_session_id,
        checkout_url=checkout.checkout_url,
        idempotency_key=checkout.idempotency_key,
        request_fingerprint=checkout.request_fingerprint,
        actor_user_id=checkout.actor_user_id,
        expires_at=checkout.expires_at,
        revision=checkout.revision,
    )
