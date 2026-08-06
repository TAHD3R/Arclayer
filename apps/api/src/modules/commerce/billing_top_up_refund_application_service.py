from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.services.base import BaseService
from src.models.commerce.billing import CreditLedgerEntryType, WorkspaceCreditAccount, WorkspaceCreditLedger
from src.models.commerce.credit_allocation import (
    CreditLotMutationKind,
    WorkspaceCreditGrantLot,
    WorkspaceCreditLotMutation,
)
from src.models.commerce.payments import (
    CommerceInvoice,
    CommerceInvoiceStatus,
    CommerceRefund,
    CommerceRefundStatus,
    CommerceTopUpSettlementApplication,
    CommerceTransaction,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.billing_connector import BillingRefundConnector, ProviderRefundOutcome
from src.modules.commerce.billing_provider_application_service import VerifiedBillingProviderEvent


class BillingTopUpRefundResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    refund_id: UUID
    workspace_id: UUID
    transaction_id: UUID
    status: CommerceRefundStatus
    amount_micros: int = Field(gt=0)
    credit_amount: int = Field(gt=0)
    external_refund_id: str | None
    held_credits: int


class BillingRefundStore(Protocol):
    async def database_time(self, *, conn: BaseDBAsyncClient) -> datetime: ...


class BillingTopUpRefundApplicationService(BaseService):
    """Provider-neutral full top-up refund hold and confirmed reversal authority."""

    async def request_refund(
        self,
        *,
        transaction_id: UUID,
        actor_user_id: UUID,
        reason: str,
        idempotency_key: str,
        provider: BillingRefundConnector,
    ) -> BillingTopUpRefundResult:
        key = idempotency_key.strip()
        if not key:
            raise BadRequest(error="BILLING_REFUND_IDEMPOTENCY_KEY_INVALID")
        request_fingerprint = _request_fingerprint(
            transaction_id=transaction_id,
            actor_user_id=actor_user_id,
            reason=reason,
        )
        async with self.tx() as conn:
            existing = await CommerceRefund.filter(idempotency_key=key).using_db(conn).select_for_update().first()
            if existing is not None:
                if existing.actor_user_id != actor_user_id or existing.reason != reason:
                    raise Conflict(error="BILLING_REFUND_IDEMPOTENCY_CONFLICT")
                refund = existing
            else:
                refund = await self._create_pending_refund(
                    transaction_id=transaction_id,
                    actor_user_id=actor_user_id,
                    reason=reason,
                    idempotency_key=key,
                    request_fingerprint=request_fingerprint,
                    conn=conn,
                )
        if refund.external_refund_id is None and refund.status == CommerceRefundStatus.PENDING:
            try:
                transaction = await CommerceTransaction.get(id=transaction_id)
                provider_result = await provider.create_refund(
                    external_transaction_id=transaction.external_transaction_id,
                    amount_micros=int(refund.amount_micros),
                    currency=transaction.currency,
                    idempotency_key=f"arclayer:refund:{refund.id}",
                )
            except Exception as exc:
                await self._release_failed_request(refund_id=refund.id, failure_code="BILLING_REFUND_REQUEST_FAILED")
                if isinstance(exc, (BadRequest, Conflict, NotFound, ServiceUnavailable)):
                    raise
                raise ServiceUnavailable(error="BILLING_REFUND_REQUEST_FAILED") from exc
            if (
                provider_result.external_transaction_id != transaction.external_transaction_id
                or provider_result.amount_micros != refund.amount_micros
                or provider_result.currency != transaction.currency
            ):
                await self._release_failed_request(
                    refund_id=refund.id,
                    failure_code="BILLING_REFUND_PROVIDER_FACTS_MISMATCH",
                )
                raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
            await CommerceRefund.filter(id=refund.id, status=CommerceRefundStatus.PENDING).update(
                external_refund_id=provider_result.external_refund_id,
            )
            refund.external_refund_id = provider_result.external_refund_id
        transaction = await CommerceTransaction.get(id=transaction_id)
        return _refund_result(refund, workspace_id=transaction.workspace_id)

    async def apply_provider_refund_outcome(
        self,
        *,
        outcome: ProviderRefundOutcome,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
    ) -> BillingTopUpRefundResult:
        if outcome.event_id != verified_event.provider_event_id:
            raise BadRequest(error="BILLING_REFUND_EVENT_INVALID")
        async with self.tx() as conn:
            refund = await (
                CommerceRefund
                .filter(external_refund_id=outcome.external_refund_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if refund is None:
                raise NotFound(error="BILLING_REFUND_NOT_FOUND")
            transaction = await CommerceTransaction.filter(id=refund.transaction_id).using_db(conn).first()
            if transaction is None:
                raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
            await self._validate_outcome(
                refund=refund,
                transaction=transaction,
                outcome=outcome,
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                conn=conn,
            )
            if refund.status != CommerceRefundStatus.PENDING:
                return _refund_result(refund, workspace_id=transaction.workspace_id)
            if outcome.status != "succeeded":
                await self._release_hold(
                    refund=refund,
                    transaction=transaction,
                    status=CommerceRefundStatus.FAILED if outcome.status == "failed" else CommerceRefundStatus.CANCELED,
                    failure_code=f"BILLING_REFUND_{outcome.status.upper()}",
                    provider_event_id=outcome.event_id,
                    conn=conn,
                )
                return _refund_result(refund, workspace_id=transaction.workspace_id)
            return await self._apply_success(
                refund=refund,
                transaction=transaction,
                outcome=outcome,
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                verified_event=verified_event,
                conn=conn,
            )

    async def _create_pending_refund(
        self,
        *,
        transaction_id: UUID,
        actor_user_id: UUID,
        reason: str,
        idempotency_key: str,
        request_fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceRefund:
        transaction = await CommerceTransaction.filter(id=transaction_id).using_db(conn).select_for_update().first()
        if (
            transaction is None
            or transaction.kind != CommerceTransactionKind.TOP_UP
            or transaction.status != CommerceTransactionStatus.SUCCEEDED
            or transaction.credit_amount is None
        ):
            raise Conflict(error="BILLING_REFUND_TRANSACTION_NOT_REFUNDABLE")
        if await CommerceRefund.filter(transaction_id=transaction.id).using_db(conn).exists():
            raise Conflict(error="BILLING_REFUND_ALREADY_REQUESTED")
        application = await (
            CommerceTopUpSettlementApplication
            .filter(transaction_id=transaction.id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if application is None or application.grant_lot_id is None:
            raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
        lot = (
            await WorkspaceCreditGrantLot.filter(id=application.grant_lot_id).using_db(conn).select_for_update().first()
        )
        account = (
            None
            if lot is None
            else await WorkspaceCreditAccount.filter(id=lot.account_id).using_db(conn).select_for_update().first()
        )
        if account is None or lot is None:
            raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
        credit_amount = int(transaction.credit_amount)
        available = int(lot.remaining_credits) - int(lot.reserved_credits)
        if available < credit_amount:
            raise Conflict(error="BILLING_REFUND_CREDITS_UNAVAILABLE")
        refund = await CommerceRefund.create(
            transaction_id=transaction.id,
            status=CommerceRefundStatus.PENDING,
            amount_micros=int(transaction.amount_micros),
            credit_amount=credit_amount,
            reason=reason,
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
            external_refund_id=None,
            provider_event_id=None,
            completed_at=None,
            failure_code=None,
            using_db=conn,
        )
        lot.reserved_credits += credit_amount
        account.reserved_credits += credit_amount
        await lot.save(using_db=conn, update_fields=["reserved_credits", "updated_at"])
        account.revision += 1
        await account.save(using_db=conn, update_fields=["reserved_credits", "revision", "updated_at"])
        await WorkspaceCreditLedger.create(
            workspace_id=transaction.workspace_id,
            account_id=account.id,
            subscription_id=account.subscription_id,
            plan_revision_id=account.plan_revision_id,
            entry_type=CreditLedgerEntryType.RESERVATION,
            applied_credit_value_micros=1,
            delta_balance_credits=0,
            delta_reserved_credits=credit_amount,
            balance_after_credits=account.balance_credits,
            reserved_after_credits=account.reserved_credits,
            idempotency_key=f"commerce:refund-hold:{refund.id}",
            actor_user_id=actor_user_id,
            description_key="LEDGER_REFUND_HOLD",
            using_db=conn,
        )
        return refund

    async def _validate_outcome(
        self,
        *,
        refund: CommerceRefund,
        transaction: CommerceTransaction,
        outcome: ProviderRefundOutcome,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        application = await (
            CommerceTopUpSettlementApplication.filter(transaction_id=transaction.id).using_db(conn).first()
        )
        if (
            transaction.provider != provider
            or str(transaction.provider_mode) != provider_mode
            or transaction.external_transaction_id != outcome.external_transaction_id
            or transaction.amount_micros != outcome.amount_micros
            or transaction.currency != outcome.currency
            or refund.amount_micros != outcome.amount_micros
            or refund.external_refund_id != outcome.external_refund_id
            or application is None
            or application.provider_account_id != provider_account_id
        ):
            raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")

    async def _apply_success(
        self,
        *,
        refund: CommerceRefund,
        transaction: CommerceTransaction,
        outcome: ProviderRefundOutcome,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        verified_event: VerifiedBillingProviderEvent,
        conn: BaseDBAsyncClient,
    ) -> BillingTopUpRefundResult:
        settlement_application = await (
            CommerceTopUpSettlementApplication
            .filter(transaction_id=transaction.id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if settlement_application is None or settlement_application.grant_lot_id is None:
            raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
        lot = (
            await WorkspaceCreditGrantLot
            .filter(id=settlement_application.grant_lot_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        account = (
            await WorkspaceCreditAccount
            .filter(workspace_id=transaction.workspace_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if (
            lot is None
            or account is None
            or int(lot.reserved_credits) < int(refund.credit_amount)
            or int(account.reserved_credits) < int(refund.credit_amount)
        ):
            raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
        credit_amount = int(refund.credit_amount)
        lot.reserved_credits -= credit_amount
        lot.remaining_credits -= credit_amount
        account.reserved_credits -= credit_amount
        account.balance_credits -= credit_amount
        if account.balance_credits < account.reserved_credits or lot.remaining_credits < 0:
            raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
        account.revision += 1
        await lot.save(using_db=conn, update_fields=["reserved_credits", "remaining_credits", "updated_at"])
        await account.save(
            using_db=conn, update_fields=["balance_credits", "reserved_credits", "revision", "updated_at"]
        )
        ledger = await WorkspaceCreditLedger.create(
            workspace_id=transaction.workspace_id,
            account_id=account.id,
            subscription_id=account.subscription_id,
            plan_revision_id=account.plan_revision_id,
            entry_type=CreditLedgerEntryType.REFUND,
            applied_credit_value_micros=1,
            delta_balance_credits=-credit_amount,
            delta_reserved_credits=-credit_amount,
            balance_after_credits=account.balance_credits,
            reserved_after_credits=account.reserved_credits,
            idempotency_key=f"commerce:refund:{refund.id}",
            actor_user_id=refund.actor_user_id,
            description_key="LEDGER_REFUND",
            using_db=conn,
        )
        await WorkspaceCreditLotMutation.create(
            lot_id=lot.id,
            ledger_entry_id=ledger.id,
            kind=CreditLotMutationKind.REFUND,
            delta_remaining_credits=-credit_amount,
            source_identity=f"refund:{refund.id}",
            actor_user_id=refund.actor_user_id,
            reason=refund.reason,
            evidence_reference=verified_event.provider_event_id,
            occurred_at=outcome.occurred_at,
            using_db=conn,
        )
        transaction.status = CommerceTransactionStatus.REFUNDED
        transaction.provider_event_id = outcome.event_id
        await transaction.save(using_db=conn, update_fields=["status", "provider_event_id", "updated_at"])
        refund.status = CommerceRefundStatus.SUCCEEDED
        refund.provider_event_id = outcome.event_id
        refund.completed_at = outcome.occurred_at
        await refund.save(using_db=conn, update_fields=["status", "provider_event_id", "completed_at", "updated_at"])
        invoice = await CommerceInvoice.filter(id=transaction.invoice_id).using_db(conn).select_for_update().first()
        if invoice is not None:
            invoice.amount_refunded_micros += int(refund.amount_micros)
            invoice.status = CommerceInvoiceStatus.REFUNDED
            await invoice.save(using_db=conn, update_fields=["amount_refunded_micros", "status", "updated_at"])
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name="commerce.top_up.refund_applied",
                actor_user_id=refund.actor_user_id,
                workspace_id=transaction.workspace_id,
                entity_type="commerce_refund",
                entity_id=refund.id,
                source="job",
                properties={
                    "provider_event_id": outcome.event_id,
                    "external_refund_id": outcome.external_refund_id,
                    "external_transaction_id": outcome.external_transaction_id,
                    "credit_amount": credit_amount,
                    "amount_micros": int(refund.amount_micros),
                    "provider": provider,
                    "provider_mode": provider_mode,
                    "provider_account_id": provider_account_id,
                },
            ),
            conn=conn,
        )
        return _refund_result(refund, workspace_id=transaction.workspace_id)

    async def _release_failed_request(self, *, refund_id: UUID, failure_code: str) -> None:
        async with self.tx() as conn:
            refund = await CommerceRefund.filter(id=refund_id).using_db(conn).select_for_update().first()
            if refund is None or refund.status != CommerceRefundStatus.PENDING:
                return
            transaction = await CommerceTransaction.filter(id=refund.transaction_id).using_db(conn).first()
            if transaction is None:
                raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
            settlement = await (
                CommerceTopUpSettlementApplication
                .filter(transaction_id=transaction.id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if settlement is None or settlement.grant_lot_id is None:
                raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
            lot = (
                await WorkspaceCreditGrantLot
                .filter(id=settlement.grant_lot_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            account = (
                await WorkspaceCreditAccount
                .filter(workspace_id=transaction.workspace_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if (
                lot is None
                or account is None
                or int(lot.reserved_credits) < int(refund.credit_amount)
                or int(account.reserved_credits) < int(refund.credit_amount)
            ):
                raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
            lot.reserved_credits -= int(refund.credit_amount)
            account.reserved_credits -= int(refund.credit_amount)
            account.revision += 1
            await lot.save(using_db=conn, update_fields=["reserved_credits", "updated_at"])
            await account.save(using_db=conn, update_fields=["reserved_credits", "revision", "updated_at"])
            await WorkspaceCreditLedger.create(
                workspace_id=transaction.workspace_id,
                account_id=account.id,
                subscription_id=account.subscription_id,
                plan_revision_id=account.plan_revision_id,
                entry_type=CreditLedgerEntryType.RELEASE,
                applied_credit_value_micros=1,
                delta_balance_credits=0,
                delta_reserved_credits=-int(refund.credit_amount),
                balance_after_credits=account.balance_credits,
                reserved_after_credits=account.reserved_credits,
                idempotency_key=f"commerce:refund-release:{refund.id}",
                actor_user_id=refund.actor_user_id,
                description_key="LEDGER_REFUND_HOLD_RELEASE",
                using_db=conn,
            )
            refund.status = CommerceRefundStatus.FAILED
            refund.failure_code = failure_code
            await refund.save(using_db=conn, update_fields=["status", "failure_code", "updated_at"])

    async def _release_hold(
        self,
        *,
        refund: CommerceRefund,
        transaction: CommerceTransaction,
        status: CommerceRefundStatus,
        failure_code: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        settlement = await (
            CommerceTopUpSettlementApplication
            .filter(transaction_id=transaction.id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if settlement is None or settlement.grant_lot_id is None:
            raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
        lot = (
            await WorkspaceCreditGrantLot.filter(id=settlement.grant_lot_id).using_db(conn).select_for_update().first()
        )
        account = (
            await WorkspaceCreditAccount
            .filter(workspace_id=transaction.workspace_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if (
            lot is None
            or account is None
            or int(lot.reserved_credits) < int(refund.credit_amount)
            or int(account.reserved_credits) < int(refund.credit_amount)
        ):
            raise Conflict(error="BILLING_REFUND_RECONCILIATION_REQUIRED")
        lot.reserved_credits -= int(refund.credit_amount)
        account.reserved_credits -= int(refund.credit_amount)
        account.revision += 1
        await lot.save(using_db=conn, update_fields=["reserved_credits", "updated_at"])
        await account.save(using_db=conn, update_fields=["reserved_credits", "revision", "updated_at"])
        await WorkspaceCreditLedger.create(
            workspace_id=transaction.workspace_id,
            account_id=account.id,
            subscription_id=account.subscription_id,
            plan_revision_id=account.plan_revision_id,
            entry_type=CreditLedgerEntryType.RELEASE,
            applied_credit_value_micros=1,
            delta_balance_credits=0,
            delta_reserved_credits=-int(refund.credit_amount),
            balance_after_credits=account.balance_credits,
            reserved_after_credits=account.reserved_credits,
            idempotency_key=f"commerce:refund-release:{refund.id}",
            actor_user_id=refund.actor_user_id,
            description_key="LEDGER_REFUND_HOLD_RELEASE",
            using_db=conn,
        )
        refund.status = status
        refund.failure_code = failure_code
        refund.provider_event_id = provider_event_id
        refund.completed_at = datetime.now(UTC)
        await refund.save(
            using_db=conn, update_fields=["status", "failure_code", "provider_event_id", "completed_at", "updated_at"]
        )


def _request_fingerprint(*, transaction_id: UUID, actor_user_id: UUID, reason: str) -> str:
    return sha256(f"{transaction_id}:{actor_user_id}:{reason}".encode()).hexdigest()


def _refund_result(refund: CommerceRefund, *, workspace_id: UUID) -> BillingTopUpRefundResult:
    return BillingTopUpRefundResult(
        refund_id=refund.id,
        workspace_id=workspace_id,
        transaction_id=refund.transaction_id,
        status=refund.status,
        amount_micros=int(refund.amount_micros),
        credit_amount=int(refund.credit_amount or 0),
        external_refund_id=refund.external_refund_id,
        held_credits=int(refund.credit_amount or 0) if refund.status == CommerceRefundStatus.PENDING else 0,
    )
