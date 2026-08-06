from __future__ import annotations

from uuid import UUID

from pydantic import AwareDatetime, ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import (
    BillingProviderMode,
    PlanRevisionStatus,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.models.commerce.payments import (
    CommerceCheckoutKind,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
    CommerceCreditTopUpOffer,
    CommerceCreditTopUpOfferPrice,
)
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event

_TOP_UP_CHECKOUT_LOCK_NAMESPACE = "arclayer:commerce:top-up-checkout"


class TopUpCheckoutCreate(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    top_up_offer_id: UUID
    top_up_offer_revision: int = Field(..., ge=1)
    credit_amount: int = Field(..., gt=0)
    provider: str = Field(..., min_length=1, max_length=32)
    provider_mode: BillingProviderMode
    provider_account_id: str = Field(..., min_length=1, max_length=255)
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(..., gt=0)
    external_price_id: str = Field(..., min_length=1, max_length=255)
    external_session_id: str = Field(..., min_length=1, max_length=255)
    checkout_url: str = Field(..., min_length=1)
    idempotency_key: str = Field(..., min_length=1, max_length=160)
    request_fingerprint: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    actor_user_id: UUID
    expires_at: AwareDatetime


class TopUpCheckoutSelection(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    top_up_offer_id: UUID
    top_up_offer_revision: int = Field(..., ge=1)
    credit_amount: int = Field(..., gt=0)
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(..., gt=0)
    external_price_id: str = Field(..., min_length=1, max_length=255)
    customer_id: str | None = Field(default=None, min_length=1, max_length=128)


class TopUpCheckoutSessionRecord(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: UUID
    workspace_id: UUID
    top_up_offer_id: UUID
    top_up_offer_revision: int
    credit_amount: int
    provider: str
    provider_mode: BillingProviderMode
    provider_account_id: str
    status: CommerceCheckoutStatus
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


class TortoiseTopUpCheckoutRepository(TortoiseORMRepository[CommerceCheckoutSession]):
    def __init__(self) -> None:
        super().__init__(CommerceCheckoutSession)

    async def lock_idempotency_scope(self, *, idempotency_key: str, conn: BaseDBAsyncClient) -> None:
        await conn.execute_query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [f"{_TOP_UP_CHECKOUT_LOCK_NAMESPACE}:{idempotency_key}"],
        )

    async def require_replay(
        self,
        *,
        idempotency_key: str,
        request_fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> TopUpCheckoutSessionRecord | None:
        checkout = await (
            CommerceCheckoutSession.filter(idempotency_key=idempotency_key).using_db(conn).select_for_update().first()
        )
        if checkout is None:
            return None
        if checkout.request_fingerprint != request_fingerprint:
            raise Conflict(error="BILLING_TOP_UP_CHECKOUT_IDEMPOTENCY_CONFLICT")
        return top_up_checkout_record(checkout)

    async def get_checkout_selection(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        top_up_offer_id: UUID,
        provider: str,
        provider_mode: BillingProviderMode,
        conn: BaseDBAsyncClient,
    ) -> TopUpCheckoutSelection:
        await _lock_top_up_checkout_actor_scope(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            conn=conn,
        )
        currency, customer_id = await _workspace_top_up_billing_facts(
            workspace_id=workspace_id,
            conn=conn,
        )
        offer, price = await _lock_top_up_checkout_catalog(
            top_up_offer_id=top_up_offer_id,
            provider=provider,
            provider_mode=provider_mode,
            currency=currency,
            conn=conn,
        )
        if offer is None or not offer.is_active or price is None:
            raise BadRequest(error="BILLING_TOP_UP_OFFER_NOT_AVAILABLE")
        return TopUpCheckoutSelection(
            top_up_offer_id=offer.id,
            top_up_offer_revision=offer.revision,
            credit_amount=offer.credit_amount,
            currency=price.currency,
            amount_micros=price.amount_micros,
            external_price_id=price.external_price_id,
            customer_id=customer_id,
        )

    async def create_top_up_checkout(
        self,
        *,
        settings: Settings,
        command: TopUpCheckoutCreate,
        conn: BaseDBAsyncClient,
    ) -> TopUpCheckoutSessionRecord:
        await self._require_actor_scope(command=command, conn=conn)
        await self._require_catalog_snapshot(command=command, conn=conn)
        checkout = await CommerceCheckoutSession.create(
            using_db=conn,
            workspace_id=command.workspace_id,
            subscription_id=None,
            target_plan_revision_id=None,
            top_up_offer_id=command.top_up_offer_id,
            top_up_offer_revision=command.top_up_offer_revision,
            plan_code=None,
            provider=command.provider,
            provider_mode=command.provider_mode,
            provider_account_id=command.provider_account_id,
            kind=CommerceCheckoutKind.TOP_UP,
            status=CommerceCheckoutStatus.PENDING,
            billing_cycle=None,
            currency=command.currency,
            amount_micros=command.amount_micros,
            credit_amount=command.credit_amount,
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
                event_name="commerce.top_up_checkout.created",
                actor_user_id=command.actor_user_id,
                workspace_id=command.workspace_id,
                entity_type="commerce_checkout_session",
                entity_id=checkout.id,
                source="api",
                properties={
                    "top_up_offer_id": str(command.top_up_offer_id),
                    "top_up_offer_revision": command.top_up_offer_revision,
                    "credit_amount": command.credit_amount,
                    "provider": command.provider,
                    "provider_mode": str(command.provider_mode),
                    "provider_account_id": command.provider_account_id,
                    "external_price_id": command.external_price_id,
                    "external_session_id": command.external_session_id,
                    "currency": command.currency,
                    "amount_micros": command.amount_micros,
                    "idempotency_key_reference": command.idempotency_key,
                    "request_fingerprint": command.request_fingerprint,
                },
            ),
            conn=conn,
        )
        return top_up_checkout_record(checkout)

    @staticmethod
    async def _require_actor_scope(*, command: TopUpCheckoutCreate, conn: BaseDBAsyncClient) -> None:
        await _lock_top_up_checkout_actor_scope(
            workspace_id=command.workspace_id,
            actor_user_id=command.actor_user_id,
            conn=conn,
        )

    @staticmethod
    async def _require_catalog_snapshot(*, command: TopUpCheckoutCreate, conn: BaseDBAsyncClient) -> None:
        offer = await (
            CommerceCreditTopUpOffer.filter(id=command.top_up_offer_id).using_db(conn).select_for_update().first()
        )
        price = await (
            CommerceCreditTopUpOfferPrice
            .filter(
                offer_id=command.top_up_offer_id,
                provider=command.provider,
                provider_mode=command.provider_mode,
                currency=command.currency,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if (
            offer is None
            or not offer.is_active
            or offer.revision != command.top_up_offer_revision
            or offer.credit_amount != command.credit_amount
            or price is None
            or price.amount_micros != command.amount_micros
            or price.external_price_id != command.external_price_id
        ):
            raise Conflict(error="BILLING_TOP_UP_CHECKOUT_SELECTION_STALE")


def top_up_checkout_record(checkout: CommerceCheckoutSession) -> TopUpCheckoutSessionRecord:
    if (
        checkout.kind != CommerceCheckoutKind.TOP_UP
        or checkout.subscription_id is not None
        or checkout.target_plan_revision_id is not None
        or checkout.plan_code is not None
        or checkout.billing_cycle is not None
        or checkout.top_up_offer_id is None
        or checkout.top_up_offer_revision is None
        or checkout.top_up_offer_revision < 1
        or checkout.credit_amount is None
        or checkout.credit_amount < 1
        or checkout.amount_micros < 1
    ):
        raise ServiceUnavailable(error="BILLING_TOP_UP_CHECKOUT_EVIDENCE_INVALID")
    return TopUpCheckoutSessionRecord(
        id=checkout.id,
        workspace_id=checkout.workspace_id,
        top_up_offer_id=checkout.top_up_offer_id,
        top_up_offer_revision=checkout.top_up_offer_revision,
        credit_amount=checkout.credit_amount,
        provider=checkout.provider,
        provider_mode=checkout.provider_mode,
        provider_account_id=checkout.provider_account_id,
        status=checkout.status,
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


async def _lock_top_up_checkout_actor_scope(
    *,
    workspace_id: UUID,
    actor_user_id: UUID,
    conn: BaseDBAsyncClient,
) -> None:
    workspace = await Workspace.filter(id=workspace_id).using_db(conn).select_for_update().first()
    if workspace is None or workspace.deleted_at is not None:
        raise NotFound(error="WORKSPACE_NOT_FOUND")
    if workspace.archived_at is not None:
        raise BadRequest(error="WORKSPACE_ARCHIVED")
    if not workspace.is_active:
        raise BadRequest(error="WORKSPACE_INACTIVE")
    membership = await (
        WorkspaceMembership
        .filter(
            workspace_id=workspace_id,
            user_id=actor_user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        .using_db(conn)
        .select_for_update()
        .first()
    )
    if membership is None:
        raise BadRequest(error="MEMBERSHIP_NOT_ACTIVE")


async def _workspace_top_up_billing_facts(
    *,
    workspace_id: UUID,
    conn: BaseDBAsyncClient,
) -> tuple[str, str | None]:
    subscription = await (
        WorkspaceSubscription.filter(workspace_id=workspace_id).using_db(conn).select_related("plan_revision").first()
    )
    if subscription is None:
        raise Conflict(error="WORKSPACE_COMMERCIAL_UNINITIALIZED")
    revision = subscription.plan_revision
    if revision.status != PlanRevisionStatus.PUBLISHED or revision.published_at is None:
        raise Conflict(error="WORKSPACE_COMMERCIAL_REVISION_INVALID")
    account = await WorkspaceCreditAccount.filter(workspace_id=workspace_id).using_db(conn).first()
    if (
        account is None
        or account.subscription_id != subscription.id
        or account.plan_revision_id != subscription.plan_revision_id
    ):
        raise Conflict(error="WORKSPACE_COMMERCIAL_ACCOUNT_INVALID")
    return revision.currency, subscription.external_customer_id


async def _lock_top_up_checkout_catalog(
    *,
    top_up_offer_id: UUID,
    provider: str,
    provider_mode: BillingProviderMode,
    currency: str,
    conn: BaseDBAsyncClient,
) -> tuple[CommerceCreditTopUpOffer | None, CommerceCreditTopUpOfferPrice | None]:
    offer = await CommerceCreditTopUpOffer.filter(id=top_up_offer_id).using_db(conn).select_for_update().first()
    price = await (
        CommerceCreditTopUpOfferPrice
        .filter(
            offer_id=top_up_offer_id,
            provider=provider,
            provider_mode=provider_mode,
            currency=currency,
        )
        .using_db(conn)
        .select_for_update()
        .first()
    )
    return offer, price
