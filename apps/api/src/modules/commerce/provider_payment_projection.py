from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from json import dumps
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.services import BaseService
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceInvoice,
    CommerceInvoiceStatus,
    CommerceProviderPaymentProjection,
    CommerceProviderPaymentTransactionProjection,
    CommerceTransaction,
    CommerceTransactionStatus,
)
from src.modules.commerce.billing_connector import ProviderInvoiceProjection, ProviderTransactionProjection
from src.modules.commerce.provider_payment_projection_repository import (
    ProviderPaymentProjectionStore,
    TortoiseProviderPaymentProjectionStore,
)

_INVOICE_TRANSITIONS: dict[CommerceInvoiceStatus, frozenset[CommerceInvoiceStatus]] = {
    CommerceInvoiceStatus.OPEN: frozenset({
        CommerceInvoiceStatus.OPEN,
        CommerceInvoiceStatus.PAID,
        CommerceInvoiceStatus.VOID,
        CommerceInvoiceStatus.UNCOLLECTIBLE,
    }),
    CommerceInvoiceStatus.PAID: frozenset({
        CommerceInvoiceStatus.PAID,
        CommerceInvoiceStatus.PARTIALLY_REFUNDED,
        CommerceInvoiceStatus.REFUNDED,
    }),
    CommerceInvoiceStatus.PARTIALLY_REFUNDED: frozenset({
        CommerceInvoiceStatus.PARTIALLY_REFUNDED,
        CommerceInvoiceStatus.REFUNDED,
    }),
    CommerceInvoiceStatus.VOID: frozenset({CommerceInvoiceStatus.VOID}),
    CommerceInvoiceStatus.UNCOLLECTIBLE: frozenset({CommerceInvoiceStatus.UNCOLLECTIBLE}),
    CommerceInvoiceStatus.REFUNDED: frozenset({CommerceInvoiceStatus.REFUNDED}),
}

_TRANSACTION_TRANSITIONS: dict[CommerceTransactionStatus, frozenset[CommerceTransactionStatus]] = {
    CommerceTransactionStatus.PENDING: frozenset({
        CommerceTransactionStatus.PENDING,
        CommerceTransactionStatus.SUCCEEDED,
        CommerceTransactionStatus.FAILED,
        CommerceTransactionStatus.CANCELED,
    }),
    CommerceTransactionStatus.SUCCEEDED: frozenset({
        CommerceTransactionStatus.SUCCEEDED,
        CommerceTransactionStatus.PARTIALLY_REFUNDED,
        CommerceTransactionStatus.REFUNDED,
    }),
    CommerceTransactionStatus.PARTIALLY_REFUNDED: frozenset({
        CommerceTransactionStatus.PARTIALLY_REFUNDED,
        CommerceTransactionStatus.REFUNDED,
    }),
    CommerceTransactionStatus.FAILED: frozenset({CommerceTransactionStatus.FAILED}),
    CommerceTransactionStatus.CANCELED: frozenset({CommerceTransactionStatus.CANCELED}),
    CommerceTransactionStatus.REFUNDED: frozenset({CommerceTransactionStatus.REFUNDED}),
}


class ProviderPaymentProjectionCommand(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    subscription_id: UUID
    plan_revision_id: UUID
    application_id: UUID
    provider: str
    provider_mode: BillingProviderMode
    provider_account_id: str
    provider_event_id: str
    payload_sha256: str
    signature_reference: str


class ProviderPaymentProjectionResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    invoice_id: UUID
    transaction_ids: tuple[UUID, ...]
    disposition: str


class ProviderPaymentProjectionService(BaseService):
    """Projects signed Provider invoice and transaction facts exactly once."""

    def __init__(self, *, store: ProviderPaymentProjectionStore, settings: Settings | None = None) -> None:
        super().__init__(settings)
        self._store = store

    async def apply(
        self,
        *,
        command: ProviderPaymentProjectionCommand,
        payment: ProviderInvoiceProjection,
        conn: BaseDBAsyncClient,
    ) -> ProviderPaymentProjectionResult:
        fingerprint = _payment_fingerprint(command=command, payment=payment)
        receipt = await self._store.get_receipt(application_id=command.application_id, conn=conn)
        if receipt is not None:
            return await self._replay(
                receipt=receipt, command=command, payment=payment, fingerprint=fingerprint, conn=conn
            )

        invoice, stale = await self._apply_invoice(command=command, payment=payment, conn=conn)
        transactions = [
            await self._apply_transaction(
                command=command,
                invoice=invoice,
                incoming=incoming,
                provider_event_occurred_at=payment.occurred_at,
                conn=conn,
            )
            for incoming in payment.transactions
        ]
        receipt = await self._store.create_receipt(
            values={
                "application_id": command.application_id,
                "workspace_id": command.workspace_id,
                "subscription_id": command.subscription_id,
                "plan_revision_id": command.plan_revision_id,
                "invoice_id": invoice.id,
                "provider": command.provider,
                "provider_mode": command.provider_mode,
                "provider_account_id": command.provider_account_id,
                "provider_event_id": command.provider_event_id,
                "provider_event_occurred_at": payment.occurred_at,
                "payload_sha256": command.payload_sha256,
                "signature_reference": command.signature_reference,
                "payment_fingerprint": fingerprint,
                "invoice_status": payment.status,
                "amount_due_micros": payment.amount_due_micros,
                "amount_paid_micros": payment.amount_paid_micros,
                "amount_refunded_micros": payment.amount_refunded_micros,
                "result_code": "stale_ignored" if stale else "applied",
            },
            conn=conn,
        )
        for transaction, incoming in zip(transactions, payment.transactions, strict=True):
            await self._store.create_transaction_projection(
                values={
                    "payment_projection_id": receipt.id,
                    "transaction_id": transaction.id,
                    "status": incoming.status,
                    "amount_micros": incoming.amount_micros,
                    "provider_event_occurred_at": payment.occurred_at,
                },
                conn=conn,
            )
        return ProviderPaymentProjectionResult(
            invoice_id=UUID(str(invoice.id)),
            transaction_ids=tuple(UUID(str(transaction.id)) for transaction in transactions),
            disposition="stale_ignored" if stale else "applied",
        )

    async def _apply_invoice(
        self,
        *,
        command: ProviderPaymentProjectionCommand,
        payment: ProviderInvoiceProjection,
        conn: BaseDBAsyncClient,
    ) -> tuple[CommerceInvoice, bool]:
        invoice = await self._store.get_invoice(
            provider=command.provider,
            provider_mode=command.provider_mode,
            external_id=payment.external_invoice_id,
            conn=conn,
        )
        if invoice is None:
            return await self._store.create_invoice(
                values=_invoice_values(command=command, payment=payment),
                conn=conn,
            ), False
        latest = await self._store.latest_invoice_receipt(invoice_id=UUID(str(invoice.id)), conn=conn)
        self._validate_invoice_identity(invoice=invoice, latest=latest, command=command, payment=payment)
        if latest is not None and payment.occurred_at < latest.provider_event_occurred_at:
            return invoice, True
        current_status = CommerceInvoiceStatus(invoice.status)
        if payment.status not in _INVOICE_TRANSITIONS[current_status]:
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        if int(payment.amount_paid_micros) < int(invoice.amount_paid_micros):
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        if int(payment.amount_refunded_micros) < int(invoice.amount_refunded_micros):
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        invoice.status = payment.status
        invoice.amount_paid_micros = payment.amount_paid_micros
        invoice.amount_refunded_micros = payment.amount_refunded_micros
        invoice.paid_at = payment.paid_at
        update_fields = [
            "status",
            "amount_paid_micros",
            "amount_refunded_micros",
            "paid_at",
            "updated_at",
        ]
        if payment.hosted_invoice_url is not None:
            invoice.hosted_invoice_url = payment.hosted_invoice_url
            update_fields.append("hosted_invoice_url")
        await invoice.save(
            using_db=conn,
            update_fields=update_fields,
        )
        return invoice, False

    async def _apply_transaction(
        self,
        *,
        command: ProviderPaymentProjectionCommand,
        invoice: CommerceInvoice,
        incoming: ProviderTransactionProjection,
        provider_event_occurred_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> CommerceTransaction:
        transaction = await self._store.get_transaction(
            provider=command.provider,
            provider_mode=command.provider_mode,
            external_id=incoming.external_transaction_id,
            conn=conn,
        )
        if transaction is None:
            return await self._store.create_transaction(
                values=_transaction_values(command=command, invoice=invoice, incoming=incoming),
                conn=conn,
            )
        latest = await self._store.latest_transaction_projection(
            transaction_id=UUID(str(transaction.id)),
            conn=conn,
        )
        self._validate_transaction_identity(
            transaction=transaction,
            latest=latest,
            command=command,
            invoice=invoice,
            incoming=incoming,
        )
        if latest is not None and provider_event_occurred_at < latest.provider_event_occurred_at:
            return transaction
        current_status = CommerceTransactionStatus(transaction.status)
        if incoming.status not in _TRANSACTION_TRANSITIONS[current_status]:
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        transaction.status = incoming.status
        transaction.provider_event_id = command.provider_event_id
        await transaction.save(using_db=conn, update_fields=["status", "provider_event_id", "updated_at"])
        return transaction

    async def _replay(
        self,
        *,
        receipt: CommerceProviderPaymentProjection,
        command: ProviderPaymentProjectionCommand,
        payment: ProviderInvoiceProjection,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> ProviderPaymentProjectionResult:
        if (
            receipt.workspace_id != command.workspace_id
            or receipt.subscription_id != command.subscription_id
            or receipt.plan_revision_id != command.plan_revision_id
            or receipt.provider != command.provider
            or receipt.provider_mode != command.provider_mode
            or receipt.provider_account_id != command.provider_account_id
            or receipt.provider_event_id != command.provider_event_id
            or receipt.payload_sha256 != command.payload_sha256
            or receipt.signature_reference != command.signature_reference
            or receipt.payment_fingerprint != fingerprint
        ):
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        projections = await self._store.list_transaction_projections(receipt_id=UUID(str(receipt.id)), conn=conn)
        expected = {
            transaction.external_transaction_id: (transaction.status, transaction.amount_micros)
            for transaction in payment.transactions
        }
        actual = {
            projection.transaction.external_transaction_id: (projection.status, int(projection.amount_micros))
            for projection in projections
        }
        if actual != expected:
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        return ProviderPaymentProjectionResult(
            invoice_id=UUID(str(receipt.invoice_id)),
            transaction_ids=tuple(UUID(str(projection.transaction_id)) for projection in projections),
            disposition="replayed",
        )

    @staticmethod
    def _validate_invoice_identity(
        *,
        invoice: CommerceInvoice,
        latest: CommerceProviderPaymentProjection | None,
        command: ProviderPaymentProjectionCommand,
        payment: ProviderInvoiceProjection,
    ) -> None:
        if latest is None:
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        if (
            invoice.workspace_id != command.workspace_id
            or invoice.subscription_id != command.subscription_id
            or invoice.currency != payment.currency
            or int(invoice.amount_due_micros) != payment.amount_due_micros
            or invoice.period_start != payment.period_start
            or invoice.period_end != payment.period_end
            or invoice.issued_at != payment.issued_at
            or latest.provider_account_id != command.provider_account_id
        ):
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")

    @staticmethod
    def _validate_transaction_identity(
        *,
        transaction: CommerceTransaction,
        latest: CommerceProviderPaymentTransactionProjection | None,
        command: ProviderPaymentProjectionCommand,
        invoice: CommerceInvoice,
        incoming: ProviderTransactionProjection,
    ) -> None:
        if latest is None:
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
        if (
            transaction.workspace_id != command.workspace_id
            or transaction.subscription_id != command.subscription_id
            or transaction.invoice_id != invoice.id
            or transaction.kind != incoming.kind
            or transaction.currency != incoming.currency
            or int(transaction.amount_micros) != incoming.amount_micros
            or transaction.occurred_at != incoming.occurred_at
        ):
            raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")


def _invoice_values(
    *, command: ProviderPaymentProjectionCommand, payment: ProviderInvoiceProjection
) -> dict[str, object]:
    return {
        "workspace_id": command.workspace_id,
        "subscription_id": command.subscription_id,
        "provider": command.provider,
        "provider_mode": command.provider_mode,
        "external_invoice_id": payment.external_invoice_id,
        "status": payment.status,
        "currency": payment.currency,
        "amount_due_micros": payment.amount_due_micros,
        "amount_paid_micros": payment.amount_paid_micros,
        "amount_refunded_micros": payment.amount_refunded_micros,
        "period_start": payment.period_start,
        "period_end": payment.period_end,
        "hosted_invoice_url": payment.hosted_invoice_url,
        "issued_at": payment.issued_at,
        "paid_at": payment.paid_at,
    }


def _transaction_values(
    *,
    command: ProviderPaymentProjectionCommand,
    invoice: CommerceInvoice,
    incoming: ProviderTransactionProjection,
) -> dict[str, object]:
    return {
        "workspace_id": command.workspace_id,
        "subscription_id": command.subscription_id,
        "checkout_session_id": None,
        "invoice_id": invoice.id,
        "provider": command.provider,
        "provider_mode": command.provider_mode,
        "external_transaction_id": incoming.external_transaction_id,
        "kind": incoming.kind,
        "status": incoming.status,
        "currency": incoming.currency,
        "amount_micros": incoming.amount_micros,
        "credit_amount": None,
        "occurred_at": incoming.occurred_at,
        "provider_event_id": command.provider_event_id,
    }


def _payment_fingerprint(*, command: ProviderPaymentProjectionCommand, payment: ProviderInvoiceProjection) -> str:
    canonical = dumps(
        {
            "command": command.model_dump(mode="json"),
            "payment": payment.model_dump(mode="json"),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256(canonical.encode()).hexdigest()


def build_provider_payment_projection_service(*, settings: Settings | None = None) -> ProviderPaymentProjectionService:
    return ProviderPaymentProjectionService(
        store=TortoiseProviderPaymentProjectionStore(),
        settings=settings,
    )
