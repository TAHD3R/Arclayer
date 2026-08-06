from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.services.base import BaseService
from src.models.commerce.billing import (
    BillingProviderMode,
    CommercePlanRevision,
    CreditLedgerEntryType,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import CreditGrantSource, WorkspaceCreditGrantLot
from src.models.commerce.payments import (
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
    CommerceTopUpSettlementApplication,
    CommerceTransaction,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.billing_provider_application_service import VerifiedBillingProviderEvent
from src.modules.commerce.top_up_checkout_repository import TopUpCheckoutSessionRecord, top_up_checkout_record
from src.modules.commerce.top_up_settlement_evidence import (
    ProviderTopUpSettlement,
    validate_top_up_settlement_evidence,
)
from src.modules.commerce.top_up_settlement_repository import TortoiseTopUpSettlementRepository


class BillingTopUpSettlementApplicationResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    checkout_session_id: UUID
    status: CommerceCheckoutStatus
    revision: int
    changed: bool
    granted_credits: int
    transaction_id: UUID | None
    ledger_entry_id: UUID | None
    grant_lot_id: UUID | None


class BillingProviderTopUpSettlementApplicator(Protocol):
    async def apply_provider_top_up_settlement(
        self,
        *,
        settlement: ProviderTopUpSettlement,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
    ) -> BillingTopUpSettlementApplicationResult: ...


class BillingTopUpSettlementStore(Protocol):
    async def get_application_by_event(
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceTopUpSettlementApplication | None: ...

    async def get_command_by_event(
        self,
        *,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutOutcomeCommand | None: ...

    async def get_checkout_for_update(
        self,
        *,
        checkout_session_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutSession | None: ...

    async def get_credit_scope(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlanRevision]: ...

    async def get_transaction_by_provider_identity(
        self,
        *,
        provider: str,
        provider_mode: str,
        external_transaction_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceTransaction | None: ...

    async def create_transaction(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> CommerceTransaction: ...

    async def create_ledger(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditLedger: ...

    async def create_lot(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditGrantLot: ...

    async def save_success_state(
        self,
        *,
        checkout: CommerceCheckoutSession,
        command: CommerceCheckoutOutcomeCommand,
        account: WorkspaceCreditAccount,
        completed_at: datetime,
        processed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def save_non_grant_state(
        self,
        *,
        checkout: CommerceCheckoutSession,
        command: CommerceCheckoutOutcomeCommand,
        result_status: str,
        result_revision: int,
        completed_at: datetime | None,
        checkout_changed: bool,
        processed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def create_application(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> CommerceTopUpSettlementApplication: ...

    async def database_time(self, *, conn: BaseDBAsyncClient) -> datetime: ...


class BillingProviderTopUpSettlementApplicationService(BaseService):
    def __init__(
        self,
        *,
        settings: Settings,
        store: BillingTopUpSettlementStore,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._store = store

    async def apply_provider_top_up_settlement(
        self,
        *,
        settlement: ProviderTopUpSettlement,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
    ) -> BillingTopUpSettlementApplicationResult:
        _validate_verified_event(settlement=settlement, verified_event=verified_event)
        fingerprint = _settlement_fingerprint(
            settlement=settlement,
            provider=provider,
            provider_mode=provider_mode,
            provider_account_id=provider_account_id,
        )
        async with self.tx() as conn:
            replay = await self._store.get_application_by_event(
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                provider_event_id=settlement.event_id,
                conn=conn,
            )
            if replay is not None:
                return _application_result(replay, fingerprint=fingerprint, verified_event=verified_event)
            command, checkout, record = await self._load_and_validate_evidence(
                settlement=settlement,
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                verified_event=verified_event,
                conn=conn,
            )
            processed_at = await self._store.database_time(conn=conn)
            if settlement.outcome == "succeeded":
                return await self._apply_success(
                    settlement=settlement,
                    command=command,
                    checkout=checkout,
                    record=record,
                    provider=provider,
                    provider_mode=provider_mode,
                    provider_account_id=provider_account_id,
                    verified_event=verified_event,
                    fingerprint=fingerprint,
                    processed_at=processed_at,
                    conn=conn,
                )
            return await self._apply_non_grant(
                settlement=settlement,
                command=command,
                checkout=checkout,
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                verified_event=verified_event,
                fingerprint=fingerprint,
                processed_at=processed_at,
                conn=conn,
            )

    async def _load_and_validate_evidence(
        self,
        *,
        settlement: ProviderTopUpSettlement,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
        conn: BaseDBAsyncClient,
    ) -> tuple[CommerceCheckoutOutcomeCommand, CommerceCheckoutSession, TopUpCheckoutSessionRecord]:
        if provider != "simulated" or provider_mode != BillingProviderMode.TEST or provider_account_id != "platform":
            raise ServiceUnavailable(error="BILLING_TOP_UP_SETTLEMENT_NOT_AVAILABLE")
        command = await self._store.get_command_by_event(provider_event_id=settlement.event_id, conn=conn)
        if command is None:
            raise NotFound(error="BILLING_TOP_UP_SETTLEMENT_COMMAND_NOT_FOUND")
        checkout = await self._store.get_checkout_for_update(
            checkout_session_id=settlement.checkout_session_id,
            conn=conn,
        )
        if checkout is None:
            raise NotFound(error="BILLING_SIMULATED_TOP_UP_CHECKOUT_NOT_FOUND")
        try:
            record = top_up_checkout_record(checkout)
            validate_top_up_settlement_evidence(
                checkout=record,
                settlement=settlement,
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                verified_event=verified_event,
            )
        except (ServiceUnavailable, ValueError) as exc:
            raise BadRequest(error="BILLING_TOP_UP_SETTLEMENT_EVIDENCE_INVALID") from exc
        _validate_command(command=command, settlement=settlement)
        _validate_new_application_state(command=command, checkout=checkout)
        return command, checkout, record

    async def _apply_success(
        self,
        *,
        settlement: ProviderTopUpSettlement,
        command: CommerceCheckoutOutcomeCommand,
        checkout: CommerceCheckoutSession,
        record: TopUpCheckoutSessionRecord,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
        fingerprint: str,
        processed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> BillingTopUpSettlementApplicationResult:
        subscription, account, revision = await self._store.get_credit_scope(
            workspace_id=settlement.workspace_id,
            conn=conn,
        )
        if int(revision.credit_value_micros) <= 0:
            raise Conflict(error="WORKSPACE_COMMERCIAL_REVISION_INVALID")
        existing_transaction = await self._store.get_transaction_by_provider_identity(
            provider=provider,
            provider_mode=provider_mode,
            external_transaction_id=settlement.external_transaction_id,
            conn=conn,
        )
        if existing_transaction is not None:
            raise Conflict(error="BILLING_TOP_UP_SETTLEMENT_RECONCILIATION_REQUIRED")
        settlement_identity = _settlement_identity(
            checkout_session_id=record.id,
            provider=provider,
            provider_mode=provider_mode,
            provider_account_id=provider_account_id,
            external_transaction_id=settlement.external_transaction_id,
        )
        account.balance_credits += settlement.credit_amount
        transaction = await self._store.create_transaction(
            values={
                "workspace_id": settlement.workspace_id,
                "subscription_id": None,
                "checkout_session_id": settlement.checkout_session_id,
                "invoice_id": None,
                "provider": provider,
                "provider_mode": provider_mode,
                "external_transaction_id": settlement.external_transaction_id,
                "kind": CommerceTransactionKind.TOP_UP,
                "status": CommerceTransactionStatus.SUCCEEDED,
                "currency": settlement.currency,
                "amount_micros": settlement.amount_micros,
                "credit_amount": settlement.credit_amount,
                "occurred_at": settlement.occurred_at,
                "provider_event_id": settlement.event_id,
            },
            conn=conn,
        )
        ledger = await self._store.create_ledger(
            values={
                "workspace_id": settlement.workspace_id,
                "account_id": account.id,
                "subscription_id": subscription.id,
                "plan_revision_id": revision.id,
                "entry_type": CreditLedgerEntryType.TOP_UP,
                "request_id": None,
                "provider_period_identity": None,
                "estimated_cost_micros": None,
                "actual_cost_micros": None,
                "applied_credit_value_micros": int(revision.credit_value_micros),
                "reserved_credits": 0,
                "committed_credits": 0,
                "delta_balance_credits": settlement.credit_amount,
                "delta_reserved_credits": 0,
                "balance_after_credits": account.balance_credits,
                "reserved_after_credits": account.reserved_credits,
                "idempotency_key": f"commerce:top-up:{settlement_identity}",
                "actor_user_id": record.actor_user_id,
                "description_key": "LEDGER_TOP_UP",
            },
            conn=conn,
        )
        lot = await self._store.create_lot(
            values={
                "workspace_id": settlement.workspace_id,
                "account_id": account.id,
                "subscription_id": subscription.id,
                "plan_revision_id": revision.id,
                "source": CreditGrantSource.TOP_UP,
                "source_identity": f"top-up:{record.id.hex}:{settlement_identity[:48]}",
                "granted_credits": settlement.credit_amount,
                "remaining_credits": settlement.credit_amount,
                "reserved_credits": 0,
                "issued_at": settlement.occurred_at,
                "expires_at": None,
                "actor_user_id": record.actor_user_id,
                "description_key": "LEDGER_TOP_UP",
            },
            conn=conn,
        )
        await self._store.save_success_state(
            checkout=checkout,
            command=command,
            account=account,
            completed_at=settlement.occurred_at,
            processed_at=processed_at,
            conn=conn,
        )
        await self._write_audit(
            command=command,
            settlement=settlement,
            status=CommerceCheckoutStatus.COMPLETED,
            revision=checkout.revision + 1,
            granted_credits=settlement.credit_amount,
            verified_event=verified_event,
            conn=conn,
        )
        application = await self._store.create_application(
            values=_application_values(
                settlement=settlement,
                command=command,
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                verified_event=verified_event,
                fingerprint=fingerprint,
                result_status=CommerceCheckoutStatus.COMPLETED,
                result_revision=checkout.revision + 1,
                processed_at=processed_at,
                transaction_id=transaction.id,
                ledger_entry_id=ledger.id,
                grant_lot_id=lot.id,
                granted_checkout_session_id=checkout.id,
            ),
            conn=conn,
        )
        return _application_result(application, fingerprint=fingerprint, verified_event=verified_event)

    async def _apply_non_grant(
        self,
        *,
        settlement: ProviderTopUpSettlement,
        command: CommerceCheckoutOutcomeCommand,
        checkout: CommerceCheckoutSession,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
        fingerprint: str,
        processed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> BillingTopUpSettlementApplicationResult:
        status = {
            "pending": CommerceCheckoutStatus.PENDING,
            "failed": CommerceCheckoutStatus.FAILED,
            "canceled": CommerceCheckoutStatus.CANCELED,
        }[settlement.outcome]
        changed = settlement.outcome != "pending"
        revision = checkout.revision + (1 if changed else 0)
        await self._store.save_non_grant_state(
            checkout=checkout,
            command=command,
            result_status=str(status),
            result_revision=revision,
            completed_at=settlement.occurred_at if changed else None,
            checkout_changed=changed,
            processed_at=processed_at,
            conn=conn,
        )
        await self._write_audit(
            command=command,
            settlement=settlement,
            status=status,
            revision=revision,
            granted_credits=0,
            verified_event=verified_event,
            conn=conn,
        )
        application = await self._store.create_application(
            values=_application_values(
                settlement=settlement,
                command=command,
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                verified_event=verified_event,
                fingerprint=fingerprint,
                result_status=status,
                result_revision=revision,
                processed_at=processed_at,
            ),
            conn=conn,
        )
        return _application_result(application, fingerprint=fingerprint, verified_event=verified_event)

    async def _write_audit(
        self,
        *,
        command: CommerceCheckoutOutcomeCommand,
        settlement: ProviderTopUpSettlement,
        status: CommerceCheckoutStatus,
        revision: int,
        granted_credits: int,
        verified_event: VerifiedBillingProviderEvent,
        conn: BaseDBAsyncClient,
    ) -> None:
        await write_required_activity_event(
            settings=self._settings,
            payload=ActivityAuditPayload(
                event_name="commerce.simulated_top_up.outcome_applied",
                actor_user_id=command.actor_user_id,
                workspace_id=settlement.workspace_id,
                entity_type="commerce_checkout_session",
                entity_id=settlement.checkout_session_id,
                source="job",
                properties={
                    "outcome": settlement.outcome,
                    "provider_event_id": settlement.event_id,
                    "checkout_status": str(status),
                    "checkout_revision": revision,
                    "granted_credits": granted_credits,
                    "external_transaction_id": settlement.external_transaction_id,
                    "signature_reference": verified_event.signature_reference,
                },
            ),
            conn=conn,
        )


def build_billing_top_up_settlement_application_service(
    *,
    settings: Settings,
) -> BillingProviderTopUpSettlementApplicationService:
    return BillingProviderTopUpSettlementApplicationService(
        settings=settings,
        store=TortoiseTopUpSettlementRepository(),
    )


def _validate_verified_event(
    *,
    settlement: ProviderTopUpSettlement,
    verified_event: VerifiedBillingProviderEvent,
) -> None:
    if settlement.event_id != verified_event.provider_event_id:
        raise BadRequest(error="BILLING_TOP_UP_SETTLEMENT_EVIDENCE_INVALID")


def _validate_command(
    *,
    command: CommerceCheckoutOutcomeCommand,
    settlement: ProviderTopUpSettlement,
) -> None:
    if (
        command.checkout_session_id != settlement.checkout_session_id
        or command.workspace_id != settlement.workspace_id
        or command.provider_event_id != settlement.event_id
        or str(command.outcome) != settlement.outcome
        or int(command.event_created_at.timestamp()) != int(settlement.occurred_at.timestamp())
    ):
        raise BadRequest(error="BILLING_TOP_UP_SETTLEMENT_EVIDENCE_INVALID")
    if command.processed_at is not None:
        raise ServiceUnavailable(error="BILLING_TOP_UP_SETTLEMENT_EVIDENCE_INVALID")


def _validate_new_application_state(
    *,
    command: CommerceCheckoutOutcomeCommand,
    checkout: CommerceCheckoutSession,
) -> None:
    if checkout.status != CommerceCheckoutStatus.PENDING or checkout.revision != command.expected_revision:
        raise Conflict(error="BILLING_TOP_UP_SETTLEMENT_REVISION_STALE")


def _application_values(
    *,
    settlement: ProviderTopUpSettlement,
    command: CommerceCheckoutOutcomeCommand,
    provider: str,
    provider_mode: str,
    provider_account_id: str,
    verified_event: VerifiedBillingProviderEvent,
    fingerprint: str,
    result_status: CommerceCheckoutStatus,
    result_revision: int,
    processed_at: datetime,
    transaction_id: UUID | None = None,
    ledger_entry_id: UUID | None = None,
    grant_lot_id: UUID | None = None,
    granted_checkout_session_id: UUID | None = None,
) -> dict[str, object]:
    return {
        "workspace_id": settlement.workspace_id,
        "checkout_session_id": settlement.checkout_session_id,
        "granted_checkout_session_id": granted_checkout_session_id,
        "outcome_command_id": command.id,
        "transaction_id": transaction_id,
        "invoice_id": None,
        "ledger_entry_id": ledger_entry_id,
        "grant_lot_id": grant_lot_id,
        "provider": provider,
        "provider_mode": provider_mode,
        "provider_account_id": provider_account_id,
        "provider_event_id": settlement.event_id,
        "outcome": settlement.outcome,
        "top_up_offer_id_snapshot": settlement.top_up_offer_id,
        "top_up_offer_revision": settlement.top_up_offer_revision,
        "external_price_id": settlement.external_price_id,
        "checkout_request_fingerprint": settlement.checkout_request_fingerprint,
        "currency": settlement.currency,
        "amount_micros": settlement.amount_micros,
        "credit_amount": settlement.credit_amount,
        "external_transaction_id": settlement.external_transaction_id,
        "external_invoice_id": settlement.external_invoice_id,
        "provider_event_occurred_at": settlement.occurred_at,
        "payload_sha256": verified_event.payload_sha256,
        "signature_reference": verified_event.signature_reference,
        "settlement_fingerprint": fingerprint,
        "result_status": result_status,
        "result_revision": result_revision,
        "applied_at": processed_at,
    }


def _application_result(
    application: CommerceTopUpSettlementApplication,
    *,
    fingerprint: str,
    verified_event: VerifiedBillingProviderEvent,
) -> BillingTopUpSettlementApplicationResult:
    if (
        application.settlement_fingerprint != fingerprint
        or application.payload_sha256 != verified_event.payload_sha256
        or application.signature_reference != verified_event.signature_reference
    ):
        raise Conflict(error="BILLING_TOP_UP_SETTLEMENT_RECONCILIATION_REQUIRED")
    return BillingTopUpSettlementApplicationResult(
        workspace_id=application.workspace_id,
        checkout_session_id=application.checkout_session_id,
        status=application.result_status,
        revision=application.result_revision,
        changed=str(application.outcome) != "pending",
        granted_credits=int(application.credit_amount) if str(application.outcome) == "succeeded" else 0,
        transaction_id=application.transaction_id,
        ledger_entry_id=application.ledger_entry_id,
        grant_lot_id=application.grant_lot_id,
    )


def _settlement_fingerprint(
    *,
    settlement: ProviderTopUpSettlement,
    provider: str,
    provider_mode: str,
    provider_account_id: str,
) -> str:
    payload = {
        "provider": provider,
        "provider_mode": provider_mode,
        "provider_account_id": provider_account_id,
        "settlement": settlement.model_dump(mode="json"),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _settlement_identity(
    *,
    checkout_session_id: UUID,
    provider: str,
    provider_mode: str,
    provider_account_id: str,
    external_transaction_id: str,
) -> str:
    payload = [
        str(checkout_session_id),
        provider,
        provider_mode,
        provider_account_id,
        external_transaction_id,
    ]
    return hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode()).hexdigest()
