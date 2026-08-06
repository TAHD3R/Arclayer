from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from json import dumps
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.core.exceptions import BadRequest, Conflict
from src.core.services import BaseService
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceInvoiceStatus,
    CommercePaymentCorrection,
    CommercePaymentCorrectionDisposition,
    CommerceRefundStatus,
    CommerceTransaction,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.billing_payment_reconciliation_repository import (
    PaymentCorrectionStore,
    build_payment_correction_store,
)


class ProviderPaymentCorrectionFacts(BaseSchema):
    """Sanitized Provider facts supplied by an accepted retrieval/reconciliation boundary."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider: str = Field(min_length=1, max_length=32)
    provider_mode: BillingProviderMode
    provider_account_id: str = Field(min_length=1, max_length=255)
    provider_event_id: str = Field(min_length=1, max_length=255)
    external_transaction_id: str = Field(min_length=1, max_length=255)
    external_invoice_id: str | None = Field(default=None, max_length=255)
    external_refund_id: str | None = Field(default=None, max_length=255)
    transaction_status: CommerceTransactionStatus
    invoice_status: CommerceInvoiceStatus | None = None
    refund_status: CommerceRefundStatus | None = None
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(gt=0)
    amount_refunded_micros: int = Field(default=0, ge=0)
    credit_amount: int | None = Field(default=None, gt=0)
    provider_event_occurred_at: datetime

    @model_validator(mode="after")
    def validate_refund_shape(self) -> ProviderPaymentCorrectionFacts:
        if self.amount_refunded_micros > self.amount_micros:
            raise ValueError("refunded amount cannot exceed transaction amount")
        if self.refund_status is not None and self.external_refund_id is None:
            raise ValueError("refund status requires refund identity")
        if self.external_refund_id is not None and self.refund_status is None:
            raise ValueError("refund identity requires refund status")
        return self


class ProviderPaymentCorrectionResult(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    correction_id: UUID
    disposition: CommercePaymentCorrectionDisposition
    workspace_id: UUID | None
    transaction_id: UUID | None
    invoice_id: UUID | None
    refund_id: UUID | None
    credit_consequence: int | None
    failure_code: str | None


class BillingPaymentReconciliationService(BaseService):
    """Records Provider payment corrections without becoming a Credit adjustment path."""

    def __init__(self, settings, *, store: PaymentCorrectionStore | None = None) -> None:
        super().__init__(settings)
        self._store = store or build_payment_correction_store()

    async def reconcile(
        self,
        *,
        facts: ProviderPaymentCorrectionFacts,
        actor_user_id: UUID,
        reason: str,
        evidence_reference: str,
        idempotency_key: str,
    ) -> ProviderPaymentCorrectionResult:
        key = idempotency_key.strip()
        if not key:
            raise BadRequest(error="BILLING_PAYMENT_RECONCILIATION_IDEMPOTENCY_KEY_INVALID")
        if not reason.strip() or not evidence_reference.strip():
            raise BadRequest(error="BILLING_PAYMENT_RECONCILIATION_EVIDENCE_INVALID")
        fingerprint = _fingerprint(
            actor_user_id=actor_user_id,
            facts=facts,
            reason=reason,
            evidence_reference=evidence_reference,
        )
        async with self.tx() as conn:
            existing = await self._store.get_by_idempotency(idempotency_key=key, conn=conn)
            if existing is not None:
                if existing.request_fingerprint != fingerprint:
                    raise Conflict(error="BILLING_PAYMENT_RECONCILIATION_IDEMPOTENCY_CONFLICT")
                return _result(existing)
            by_event = await self._store.get_by_event(
                provider=facts.provider,
                provider_mode=facts.provider_mode,
                provider_account_id=facts.provider_account_id,
                provider_event_id=facts.provider_event_id,
                conn=conn,
            )
            if by_event is not None:
                if by_event.request_fingerprint != fingerprint:
                    raise Conflict(error="BILLING_PAYMENT_RECONCILIATION_EVENT_CONFLICT")
                return _result(by_event, replay=True)
            transaction = await self._store.get_transaction(
                provider=facts.provider,
                provider_mode=facts.provider_mode,
                provider_account_id=facts.provider_account_id,
                external_transaction_id=facts.external_transaction_id,
                conn=conn,
            )
            provider_account_id = (
                None
                if transaction is None
                else await self._store.get_provider_account_id(transaction_id=transaction.id, conn=conn)
            )
            invoice = await self._load_invoice(transaction=transaction, facts=facts, conn=conn, store=self._store)
            refund = await self._load_refund(transaction=transaction, facts=facts, conn=conn, store=self._store)
            disposition, failure_code, consequence = _assess(
                transaction=transaction,
                provider_account_id=provider_account_id,
                invoice=invoice,
                refund=refund,
                facts=facts,
            )
            correction = await self._store.create(
                values={
                    "workspace_id": None if transaction is None else transaction.workspace_id,
                    "transaction_id": None if transaction is None else transaction.id,
                    "invoice_id": None if invoice is None else invoice.id,
                    "refund_id": None if refund is None else refund.id,
                    "provider": facts.provider,
                    "provider_mode": facts.provider_mode,
                    "provider_account_id": facts.provider_account_id,
                    "provider_event_id": facts.provider_event_id,
                    "external_transaction_id": facts.external_transaction_id,
                    "external_invoice_id": facts.external_invoice_id,
                    "external_refund_id": facts.external_refund_id,
                    "transaction_status": facts.transaction_status,
                    "invoice_status": facts.invoice_status,
                    "refund_status": facts.refund_status,
                    "currency": facts.currency,
                    "amount_micros": facts.amount_micros,
                    "amount_refunded_micros": facts.amount_refunded_micros,
                    "credit_consequence": consequence,
                    "provider_event_occurred_at": facts.provider_event_occurred_at,
                    "actor_user_id": actor_user_id,
                    "reason": reason,
                    "evidence_reference": evidence_reference,
                    "idempotency_key": key,
                    "request_fingerprint": fingerprint,
                    "disposition": disposition,
                    "failure_code": failure_code,
                },
                conn=conn,
            )
            await write_required_activity_event(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name="commerce.payment_correction.recorded",
                    actor_user_id=actor_user_id,
                    workspace_id=None if transaction is None else transaction.workspace_id,
                    entity_type="commerce_payment_correction",
                    entity_id=correction.id,
                    properties={
                        "provider": facts.provider,
                        "provider_mode": str(facts.provider_mode),
                        "provider_account_id": facts.provider_account_id,
                        "provider_event_id": facts.provider_event_id,
                        "disposition": disposition,
                        "failure_code": failure_code,
                        "credit_consequence": consequence,
                    },
                ),
                conn=conn,
            )
            return _result(correction)

    @staticmethod
    async def _load_invoice(
        *,
        transaction: CommerceTransaction | None,
        facts: ProviderPaymentCorrectionFacts,
        conn,
        store: PaymentCorrectionStore,
    ):
        if facts.external_invoice_id is None:
            return None
        invoice = await store.get_invoice(
            provider=facts.provider,
            provider_mode=facts.provider_mode,
            external_invoice_id=facts.external_invoice_id,
            conn=conn,
        )
        if transaction is not None and (invoice is None or invoice.id != transaction.invoice_id):
            return None
        return invoice

    @staticmethod
    async def _load_refund(
        *,
        transaction: CommerceTransaction | None,
        facts: ProviderPaymentCorrectionFacts,
        conn,
        store: PaymentCorrectionStore,
    ):
        if facts.external_refund_id is None:
            return None
        refund = await store.get_refund(external_refund_id=facts.external_refund_id, conn=conn)
        if transaction is not None and (refund is None or refund.transaction_id != transaction.id):
            return None
        return refund


def _assess(*, transaction, provider_account_id, invoice, refund, facts: ProviderPaymentCorrectionFacts):
    mismatches: list[str] = []
    if transaction is None:
        mismatches.append("transaction_not_found")
    else:
        if provider_account_id != facts.provider_account_id:
            mismatches.append("provider_account")
        if transaction.status != facts.transaction_status:
            mismatches.append("transaction_status")
        if transaction.currency != facts.currency or int(transaction.amount_micros) != facts.amount_micros:
            mismatches.append("transaction_money")
        if facts.credit_amount is not None and int(transaction.credit_amount or 0) != facts.credit_amount:
            mismatches.append("credit_consequence")
    if facts.external_invoice_id is not None:
        if invoice is None or invoice.status != facts.invoice_status or invoice.currency != facts.currency:
            mismatches.append("invoice_identity_or_status")
    if facts.external_refund_id is not None:
        if refund is None or refund.status != facts.refund_status:
            mismatches.append("refund_identity_or_status")
        if refund is not None and int(refund.amount_micros) != facts.amount_refunded_micros:
            mismatches.append("refund_amount")
    if mismatches:
        return (
            CommercePaymentCorrectionDisposition.RECONCILIATION_REQUIRED,
            "BILLING_PAYMENT_RECONCILIATION_REQUIRED",
            None,
        )
    consequence = None
    if (
        transaction is not None
        and transaction.kind == CommerceTransactionKind.TOP_UP
        and facts.refund_status == CommerceRefundStatus.SUCCEEDED
    ):
        consequence = -int(transaction.credit_amount or 0)
    return CommercePaymentCorrectionDisposition.APPLIED, None, consequence


def _fingerprint(
    *, actor_user_id: UUID, facts: ProviderPaymentCorrectionFacts, reason: str, evidence_reference: str
) -> str:
    payload = dumps(
        {
            "actor_user_id": str(actor_user_id),
            "facts": facts.model_dump(mode="json"),
            "reason": reason,
            "evidence_reference": evidence_reference,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256(payload.encode()).hexdigest()


def _result(row: CommercePaymentCorrection, *, replay: bool = False) -> ProviderPaymentCorrectionResult:
    return ProviderPaymentCorrectionResult(
        correction_id=row.id,
        disposition=CommercePaymentCorrectionDisposition.REPLAYED if replay else row.disposition,
        workspace_id=row.workspace_id,
        transaction_id=row.transaction_id,
        invoice_id=row.invoice_id,
        refund_id=row.refund_id,
        credit_consequence=row.credit_consequence,
        failure_code=row.failure_code,
    )


def build_billing_payment_reconciliation_service(settings=None) -> BillingPaymentReconciliationService:
    return BillingPaymentReconciliationService(settings=settings)
