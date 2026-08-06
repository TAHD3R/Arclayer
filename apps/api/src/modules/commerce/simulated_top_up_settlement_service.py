from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import datetime
from typing import Literal, Protocol, cast
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.core.services.base import BaseService
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceCheckoutKind,
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.billing_event_acceptance_service import (
    BillingEventAcceptanceService,
    build_billing_event_acceptance_service,
)
from src.modules.commerce.checkout_outcome_repository import TortoiseCheckoutOutcomeRepository
from src.modules.commerce.simulated_checkout_outcome_service import (
    SimulatedCheckoutOutcomeOut,
    SimulatedCheckoutOutcomeWrite,
)

_SIMULATED_TOP_UP_EVENT_TYPE = "top_up.checkout.outcome"
_PROVIDER_ACCOUNT_ID = "platform"


class _SimulatedTopUpSettlementEvent(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    checkout_session_id: UUID
    external_session_id: str
    workspace_id: UUID
    actor_user_id: UUID
    top_up_offer_id: UUID
    top_up_offer_revision: int
    external_price_id: str
    checkout_request_fingerprint: str
    currency: str
    amount_micros: int
    credit_amount: int
    external_transaction_id: str
    external_invoice_id: str | None
    outcome: Literal["pending", "succeeded", "failed", "canceled"]
    provider_event_id: str
    event_created_at: datetime


class SimulatedTopUpSettlementStore(Protocol):
    async def lock_idempotency_scope(self, *, idempotency_key: str, conn: BaseDBAsyncClient) -> None: ...

    async def get_command_by_idempotency_key(
        self,
        *,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> CommerceCheckoutOutcomeCommand | None: ...

    async def get_checkout_for_update(
        self,
        *,
        checkout_session_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutSession | None: ...

    async def create_command(
        self,
        *,
        checkout_session_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        outcome: str,
        expected_revision: int,
        idempotency_key: str,
        request_fingerprint: str,
        provider_event_id: str,
        event_created_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutOutcomeCommand: ...

    async def save_acceptance(
        self,
        *,
        command_id: UUID,
        expected_revision: int,
        inbox_id: UUID,
        job_id: UUID,
        accepted_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> int: ...

    async def database_time(self, *, conn: BaseDBAsyncClient) -> datetime: ...


class SimulatedTopUpSettlementService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        acceptance: BillingEventAcceptanceService,
        store: SimulatedTopUpSettlementStore,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._acceptance = acceptance
        self._store = store

    async def create(
        self,
        *,
        workspace_id: UUID,
        checkout_session_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: SimulatedCheckoutOutcomeWrite,
    ) -> SimulatedCheckoutOutcomeOut:
        self._require_simulator()
        caller_key = idempotency_key.strip()
        if not caller_key:
            raise BadRequest(error="BILLING_CHECKOUT_OUTCOME_IDEMPOTENCY_KEY_INVALID")
        key_hash = hashlib.sha256("\0".join((str(workspace_id), str(actor_user_id), caller_key)).encode()).hexdigest()
        provider_key = f"arclayer:top-up-outcome:{key_hash}"
        request_fingerprint = _request_fingerprint(
            workspace_id=workspace_id,
            checkout_session_id=checkout_session_id,
            actor_user_id=actor_user_id,
            outcome=payload.outcome,
            expected_revision=payload.expected_revision,
        )
        event = await self._prepare_event(
            workspace_id=workspace_id,
            checkout_session_id=checkout_session_id,
            actor_user_id=actor_user_id,
            outcome=payload.outcome,
            expected_revision=payload.expected_revision,
            provider_key=provider_key,
            key_hash=key_hash,
            request_fingerprint=request_fingerprint,
        )
        raw_payload = _event_payload(event)
        acceptance = await self._acceptance.accept(
            payload=raw_payload,
            signature=_signature(
                payload=raw_payload,
                secret=self._settings.billing.simulated_signing_secret.get_secret_value(),
            ),
        )
        if not acceptance.accepted or acceptance.inbox_id is None or acceptance.job_id is None:
            raise ServiceUnavailable(error="BILLING_SIMULATOR_EVENT_NOT_ACCEPTED")
        await self._attach_acceptance(
            provider_key=provider_key,
            inbox_id=acceptance.inbox_id,
            job_id=acceptance.job_id,
        )
        return SimulatedCheckoutOutcomeOut(
            checkout_session_id=event.checkout_session_id,
            outcome=event.outcome,
            provider_event_id=event.provider_event_id,
            accepted=True,
            event_created=acceptance.created,
            inbox_id=acceptance.inbox_id,
            job_id=acceptance.job_id,
        )

    async def _prepare_event(
        self,
        *,
        workspace_id: UUID,
        checkout_session_id: UUID,
        actor_user_id: UUID,
        outcome: Literal["pending", "succeeded", "failed", "canceled"],
        expected_revision: int,
        provider_key: str,
        key_hash: str,
        request_fingerprint: str,
    ) -> _SimulatedTopUpSettlementEvent:
        async with self.tx() as conn:
            await self._store.lock_idempotency_scope(idempotency_key=provider_key, conn=conn)
            command = await self._store.get_command_by_idempotency_key(
                idempotency_key=provider_key,
                conn=conn,
                for_update=True,
            )
            checkout = await self._store.get_checkout_for_update(
                checkout_session_id=checkout_session_id,
                conn=conn,
            )
            if command is not None:
                if command.request_fingerprint != request_fingerprint:
                    raise Conflict(error="BILLING_CHECKOUT_OUTCOME_IDEMPOTENCY_CONFLICT")
                return _event_record(command=command, checkout=_require_checkout(checkout, workspace_id=workspace_id))
            database_time = await self._store.database_time(conn=conn)
            checkout = _validate_new_command_checkout(
                checkout=checkout,
                workspace_id=workspace_id,
                expected_revision=expected_revision,
                database_time=database_time,
            )
            event_created_at = database_time.replace(microsecond=0)
            provider_event_id = _provider_event_id(
                checkout_session_id=checkout_session_id,
                provider_key=provider_key,
            )
            command = await self._store.create_command(
                checkout_session_id=checkout_session_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                outcome=outcome,
                expected_revision=expected_revision,
                idempotency_key=provider_key,
                request_fingerprint=request_fingerprint,
                provider_event_id=provider_event_id,
                event_created_at=event_created_at,
                conn=conn,
            )
            await write_required_activity_event(
                settings=self._settings,
                payload=ActivityAuditPayload(
                    event_name="commerce.simulated_top_up.outcome_requested",
                    actor_user_id=actor_user_id,
                    workspace_id=workspace_id,
                    entity_type="commerce_checkout_session",
                    entity_id=checkout_session_id,
                    source="api",
                    properties={
                        "outcome": outcome,
                        "expected_revision": expected_revision,
                        "provider_event_id": provider_event_id,
                        "idempotency_key_hash": key_hash,
                    },
                ),
                conn=conn,
            )
            return _event_record(command=command, checkout=checkout)

    async def _attach_acceptance(self, *, provider_key: str, inbox_id: UUID, job_id: UUID) -> None:
        async with self.tx() as conn:
            command = await self._store.get_command_by_idempotency_key(
                idempotency_key=provider_key,
                conn=conn,
                for_update=True,
            )
            if command is None:
                raise ServiceUnavailable(error="BILLING_TOP_UP_SETTLEMENT_EVIDENCE_INVALID")
            if command.accepted_inbox_id is not None or command.accepted_job_id is not None:
                if command.accepted_inbox_id != inbox_id or command.accepted_job_id != job_id:
                    raise Conflict(error="BILLING_CHECKOUT_OUTCOME_ACCEPTANCE_CONFLICT")
                return
            updated = await self._store.save_acceptance(
                command_id=command.id,
                expected_revision=command.revision,
                inbox_id=inbox_id,
                job_id=job_id,
                accepted_at=await self._store.database_time(conn=conn),
                conn=conn,
            )
            if updated != 1:
                raise Conflict(error="BILLING_CHECKOUT_OUTCOME_ACCEPTANCE_CONFLICT")

    def _require_simulator(self) -> None:
        if self._settings.app_env not in {"development", "test"}:
            raise ServiceUnavailable(error="BILLING_SIMULATOR_PRODUCTION_FORBIDDEN")
        if self._settings.billing.provider != "simulated":
            raise ServiceUnavailable(error="BILLING_SIMULATOR_NOT_CONFIGURED")


def build_simulated_top_up_settlement_service(
    settings: Settings,
    connector_registry: ConnectorRegistry,
) -> SimulatedTopUpSettlementService:
    return SimulatedTopUpSettlementService(
        settings=settings,
        acceptance=build_billing_event_acceptance_service(
            settings,
            connector_registry,
            provider_name="simulated",
        ),
        store=TortoiseCheckoutOutcomeRepository(),
    )


def _validate_new_command_checkout(
    *,
    checkout: CommerceCheckoutSession | None,
    workspace_id: UUID,
    expected_revision: int,
    database_time: datetime,
) -> CommerceCheckoutSession:
    checkout = _require_checkout(checkout, workspace_id=workspace_id)
    if checkout.status != CommerceCheckoutStatus.PENDING:
        raise Conflict(error="BILLING_CHECKOUT_OUTCOME_NOT_PENDING")
    if checkout.expires_at <= database_time:
        raise Conflict(error="BILLING_CHECKOUT_OUTCOME_EXPIRED")
    if checkout.revision != expected_revision:
        raise Conflict(error="BILLING_TOP_UP_SETTLEMENT_REVISION_STALE")
    return checkout


def _require_checkout(
    checkout: CommerceCheckoutSession | None,
    *,
    workspace_id: UUID,
) -> CommerceCheckoutSession:
    if (
        checkout is None
        or checkout.workspace_id != workspace_id
        or checkout.provider != "simulated"
        or checkout.provider_mode != BillingProviderMode.TEST
        or checkout.kind != CommerceCheckoutKind.TOP_UP
        or checkout.top_up_offer_id is None
        or checkout.top_up_offer_revision is None
        or checkout.credit_amount is None
    ):
        raise NotFound(error="BILLING_SIMULATED_TOP_UP_CHECKOUT_NOT_FOUND")
    return checkout


def _event_record(
    *,
    command: CommerceCheckoutOutcomeCommand,
    checkout: CommerceCheckoutSession,
) -> _SimulatedTopUpSettlementEvent:
    if checkout.top_up_offer_id is None or checkout.top_up_offer_revision is None or checkout.credit_amount is None:
        raise ServiceUnavailable(error="BILLING_TOP_UP_SETTLEMENT_EVIDENCE_INVALID")
    transaction_digest = hashlib.sha256(
        f"top-up-transaction\0{checkout.id}\0{checkout.external_session_id}".encode()
    ).hexdigest()[:32]
    return _SimulatedTopUpSettlementEvent(
        checkout_session_id=checkout.id,
        external_session_id=checkout.external_session_id,
        workspace_id=checkout.workspace_id,
        actor_user_id=checkout.actor_user_id,
        top_up_offer_id=checkout.top_up_offer_id,
        top_up_offer_revision=checkout.top_up_offer_revision,
        external_price_id=checkout.external_price_id,
        checkout_request_fingerprint=checkout.request_fingerprint,
        currency=checkout.currency,
        amount_micros=checkout.amount_micros,
        credit_amount=checkout.credit_amount,
        external_transaction_id=f"sim_top_up_tx_{transaction_digest}",
        external_invoice_id=None,
        outcome=cast(Literal["pending", "succeeded", "failed", "canceled"], str(command.outcome)),
        provider_event_id=command.provider_event_id,
        event_created_at=command.event_created_at,
    )


def _event_payload(event: _SimulatedTopUpSettlementEvent) -> bytes:
    payload = {
        "account": _PROVIDER_ACCOUNT_ID,
        "created": int(event.event_created_at.timestamp()),
        "data": {
            "actor_user_id": str(event.actor_user_id),
            "amount_micros": event.amount_micros,
            "checkout_request_fingerprint": event.checkout_request_fingerprint,
            "checkout_session_id": str(event.checkout_session_id),
            "credit_amount": event.credit_amount,
            "currency": event.currency,
            "external_invoice_id": event.external_invoice_id,
            "external_price_id": event.external_price_id,
            "external_session_id": event.external_session_id,
            "external_transaction_id": event.external_transaction_id,
            "outcome": event.outcome,
            "top_up_offer_id": str(event.top_up_offer_id),
            "top_up_offer_revision": event.top_up_offer_revision,
            "workspace_id": str(event.workspace_id),
        },
        "id": event.provider_event_id,
        "mode": "test",
        "type": _SIMULATED_TOP_UP_EVENT_TYPE,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def _signature(*, payload: bytes, secret: str) -> str:
    if not secret:
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_CONFIGURED")
    timestamp = int(time.time())
    digest = hmac.new(secret.encode(), str(timestamp).encode() + b"." + payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def _request_fingerprint(
    *,
    workspace_id: UUID,
    checkout_session_id: UUID,
    actor_user_id: UUID,
    outcome: str,
    expected_revision: int,
) -> str:
    payload = {
        "actor_user_id": str(actor_user_id),
        "checkout_session_id": str(checkout_session_id),
        "expected_revision": expected_revision,
        "outcome": outcome,
        "workspace_id": str(workspace_id),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _provider_event_id(*, checkout_session_id: UUID, provider_key: str) -> str:
    digest = hashlib.sha256(f"top-up-outcome\0{checkout_session_id}\0{provider_key}".encode()).hexdigest()[:32]
    return f"sim_evt_{digest}"
