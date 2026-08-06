from __future__ import annotations

from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceCreditTopUpOffer,
    CommerceCreditTopUpOfferPrice,
    WorkspaceAutoRefillCommandReceipt,
    WorkspaceAutoRefillPolicy,
)
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.auto_refill_schema import AutoRefillOfferOut


class AutoRefillPolicyStore(Protocol):
    async def lock_workspace_and_actor(
        self, *, workspace_id: UUID, actor_user_id: UUID, conn: BaseDBAsyncClient
    ) -> None: ...

    async def get_policy(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceAutoRefillPolicy | None: ...

    async def list_offer_prices(
        self,
        *,
        provider: str,
        provider_mode: BillingProviderMode,
        currency: str | None,
        conn: BaseDBAsyncClient,
    ) -> list[AutoRefillOfferOut]: ...

    async def lock_policy(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceAutoRefillPolicy | None: ...

    async def lock_offer_price(
        self,
        *,
        offer_id: UUID,
        provider: str,
        provider_mode: BillingProviderMode,
        currency: str,
        conn: BaseDBAsyncClient,
    ) -> tuple[CommerceCreditTopUpOffer, CommerceCreditTopUpOfferPrice]: ...

    async def save_policy(
        self,
        *,
        policy: WorkspaceAutoRefillPolicy | None,
        workspace_id: UUID,
        offer_id: UUID,
        is_enabled: bool,
        trigger_below_credits: int,
        monthly_ceiling_micros: int,
        currency: str,
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceAutoRefillPolicy: ...

    async def lock_receipt(
        self, *, workspace_id: UUID, idempotency_key_hash: str, conn: BaseDBAsyncClient
    ) -> WorkspaceAutoRefillCommandReceipt | None: ...

    async def record_receipt(
        self,
        *,
        settings: Settings,
        workspace_id: UUID,
        actor_user_id: UUID,
        idempotency_key_hash: str,
        request_fingerprint: str,
        result_revision: int,
        result_snapshot: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceAutoRefillCommandReceipt: ...


class TortoiseAutoRefillPolicyRepository(TortoiseORMRepository[WorkspaceAutoRefillPolicy], AutoRefillPolicyStore):
    def __init__(self) -> None:
        super().__init__(WorkspaceAutoRefillPolicy)

    async def lock_workspace_and_actor(
        self, *, workspace_id: UUID, actor_user_id: UUID, conn: BaseDBAsyncClient
    ) -> None:
        workspace = await (
            Workspace
            .filter(id=workspace_id, is_active=True, archived_at=None, deleted_at=None)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if workspace is None:
            raise NotFound(error="WORKSPACE_NOT_FOUND")
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
            raise NotFound(error="MEMBERSHIP_NOT_ACTIVE")

    async def get_policy(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceAutoRefillPolicy | None:
        policy = await (
            WorkspaceAutoRefillPolicy.filter(workspace_id=workspace_id).using_db(conn).select_related("offer").first()
        )
        return policy

    async def lock_policy(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceAutoRefillPolicy | None:
        return await (
            WorkspaceAutoRefillPolicy.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )

    async def list_offer_prices(
        self,
        *,
        provider: str,
        provider_mode: BillingProviderMode,
        currency: str | None,
        conn: BaseDBAsyncClient,
    ) -> list[AutoRefillOfferOut]:
        rows = await (
            CommerceCreditTopUpOfferPrice
            .filter(
                provider=provider,
                provider_mode=provider_mode,
                offer__is_active=True,
                **({"currency": currency} if currency is not None else {}),
            )
            .using_db(conn)
            .select_related("offer")
            .order_by("offer__sort_order", "offer__code")
        )
        return [
            AutoRefillOfferOut(
                offer_id=row.offer_id,
                offer_code=row.offer.code,
                credit_amount=int(row.offer.credit_amount),
                currency=row.currency,
                amount_micros=int(row.amount_micros),
            )
            for row in rows
        ]

    async def lock_offer_price(
        self,
        *,
        offer_id: UUID,
        provider: str,
        provider_mode: BillingProviderMode,
        currency: str,
        conn: BaseDBAsyncClient,
    ) -> tuple[CommerceCreditTopUpOffer, CommerceCreditTopUpOfferPrice]:
        offer = await CommerceCreditTopUpOffer.filter(id=offer_id).using_db(conn).select_for_update().first()
        price = await (
            CommerceCreditTopUpOfferPrice
            .filter(
                offer_id=offer_id,
                provider=provider,
                provider_mode=provider_mode,
                currency=currency,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if offer is None or not offer.is_active or price is None:
            raise BadRequest(error="BILLING_AUTO_REFILL_OFFER_NOT_AVAILABLE")
        return offer, price

    async def save_policy(
        self,
        *,
        policy: WorkspaceAutoRefillPolicy | None,
        workspace_id: UUID,
        offer_id: UUID,
        is_enabled: bool,
        trigger_below_credits: int,
        monthly_ceiling_micros: int,
        currency: str,
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceAutoRefillPolicy:
        if policy is None:
            created = await WorkspaceAutoRefillPolicy.create(
                workspace_id=workspace_id,
                offer_id=offer_id,
                is_enabled=is_enabled,
                trigger_below_credits=trigger_below_credits,
                monthly_ceiling_micros=monthly_ceiling_micros,
                currency=currency,
                revision=revision,
                updated_by_user_id=actor_user_id,
                using_db=conn,
            )
            await created.fetch_related("offer")
            return created
        policy.offer_id = offer_id
        policy.is_enabled = is_enabled
        policy.trigger_below_credits = trigger_below_credits
        policy.monthly_ceiling_micros = monthly_ceiling_micros
        policy.currency = currency
        policy.revision = revision
        policy.updated_by_user_id = actor_user_id
        await policy.save(using_db=conn)
        await policy.fetch_related("offer")
        return policy

    async def lock_receipt(
        self, *, workspace_id: UUID, idempotency_key_hash: str, conn: BaseDBAsyncClient
    ) -> WorkspaceAutoRefillCommandReceipt | None:
        return await (
            WorkspaceAutoRefillCommandReceipt
            .filter(
                workspace_id=workspace_id,
                idempotency_key_hash=idempotency_key_hash,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def record_receipt(
        self,
        *,
        settings: Settings,
        workspace_id: UUID,
        actor_user_id: UUID,
        idempotency_key_hash: str,
        request_fingerprint: str,
        result_revision: int,
        result_snapshot: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceAutoRefillCommandReceipt:
        audit = await write_required_activity_event(
            settings=settings,
            payload=ActivityAuditPayload(
                event_name="commerce.auto_refill_policy.updated",
                actor_user_id=actor_user_id,
                workspace_id=workspace_id,
                entity_type="commerce_auto_refill_policy",
                properties={
                    "idempotency_key_hash": idempotency_key_hash,
                    "request_fingerprint": request_fingerprint,
                    "result_revision": result_revision,
                },
            ),
            conn=conn,
        )
        return await WorkspaceAutoRefillCommandReceipt.create(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            idempotency_key_hash=idempotency_key_hash,
            request_fingerprint=request_fingerprint,
            result_revision=result_revision,
            result_snapshot=result_snapshot,
            audit_event_id=audit.id,
            using_db=conn,
        )
