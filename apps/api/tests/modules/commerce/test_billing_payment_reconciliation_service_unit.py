from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.config import Settings
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceInvoiceStatus,
    CommercePaymentCorrectionDisposition,
    CommerceRefundStatus,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)
from src.modules.commerce.billing_payment_reconciliation_repository import PaymentCorrectionStore
from src.modules.commerce.billing_payment_reconciliation_service import (
    BillingPaymentReconciliationService,
    ProviderPaymentCorrectionFacts,
)


class _TransactionStore:
    def __init__(self, *, transaction: Any, invoice: Any = None, refund: Any = None, existing: Any = None) -> None:
        self.transaction = transaction
        self.invoice = invoice
        self.refund = refund
        self.existing = existing
        self.created: list[dict[str, object]] = []

    async def get_by_idempotency(self, **_: object) -> Any:
        return self.existing

    async def get_by_event(self, **_: object) -> Any:
        return None

    async def get_transaction(self, **_: object) -> Any:
        return self.transaction

    async def get_invoice(self, **_: object) -> Any:
        return self.invoice

    async def get_refund(self, **_: object) -> Any:
        return self.refund

    async def get_provider_account_id(self, **_: object) -> str | None:
        return None if self.transaction is None else "acct_test"

    async def create(self, *, values: dict[str, object], **_: object) -> Any:
        self.created.append(values)
        return SimpleNamespace(id=uuid4(), **values)


class _TransactionContext:
    async def __aenter__(self) -> object:
        return object()

    async def __aexit__(self, *_: object) -> None:
        return None


def _facts(**overrides: object) -> ProviderPaymentCorrectionFacts:
    values: dict[str, object] = {
        "provider": "stripe",
        "provider_mode": BillingProviderMode.TEST,
        "provider_account_id": "acct_test",
        "provider_event_id": "evt_payment_correction_1",
        "external_transaction_id": "pi_top_up_1",
        "external_invoice_id": "in_top_up_1",
        "external_refund_id": "re_top_up_1",
        "transaction_status": CommerceTransactionStatus.REFUNDED,
        "invoice_status": CommerceInvoiceStatus.REFUNDED,
        "refund_status": CommerceRefundStatus.SUCCEEDED,
        "currency": "USD",
        "amount_micros": 5_000_000,
        "amount_refunded_micros": 5_000_000,
        "credit_amount": 500,
        "provider_event_occurred_at": datetime(2026, 8, 6, 1, tzinfo=UTC),
    }
    values.update(overrides)
    return ProviderPaymentCorrectionFacts.model_validate(values)


@pytest.mark.asyncio
async def test_matching_top_up_refund_records_applied_correction(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_id = uuid4()
    transaction_id = uuid4()
    invoice_id = uuid4()
    refund_id = uuid4()
    transaction = SimpleNamespace(
        id=transaction_id,
        workspace_id=workspace_id,
        invoice_id=invoice_id,
        provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="acct_test",
        external_transaction_id="pi_top_up_1",
        kind=CommerceTransactionKind.TOP_UP,
        status=CommerceTransactionStatus.REFUNDED,
        currency="USD",
        amount_micros=5_000_000,
        credit_amount=500,
    )
    invoice = SimpleNamespace(id=invoice_id, status=CommerceInvoiceStatus.REFUNDED, currency="USD")
    refund = SimpleNamespace(
        id=refund_id,
        transaction_id=transaction_id,
        status=CommerceRefundStatus.SUCCEEDED,
        amount_micros=5_000_000,
    )
    store = _TransactionStore(transaction=transaction, invoice=invoice, refund=refund)
    service = BillingPaymentReconciliationService(
        settings=cast(Settings, SimpleNamespace()),
        store=cast(PaymentCorrectionStore, store),
    )
    monkeypatch.setattr(service, "tx", lambda: _TransactionContext())
    monkeypatch.setattr(
        "src.modules.commerce.billing_payment_reconciliation_service.write_required_activity_event",
        lambda **_: _completed_audit(),
    )

    result = await service.reconcile(
        facts=_facts(),
        actor_user_id=uuid4(),
        reason="Provider and local projections agree",
        evidence_reference="case-42",
        idempotency_key="correction-1",
    )

    assert result.disposition == CommercePaymentCorrectionDisposition.APPLIED
    assert result.credit_consequence == -500
    assert store.created[0]["provider_account_id"] == "acct_test"


@pytest.mark.asyncio
async def test_account_scoped_missing_transaction_is_reconciliation_required(monkeypatch: pytest.MonkeyPatch) -> None:
    store = _TransactionStore(transaction=None)
    service = BillingPaymentReconciliationService(
        settings=cast(Settings, SimpleNamespace()),
        store=cast(PaymentCorrectionStore, store),
    )
    monkeypatch.setattr(service, "tx", lambda: _TransactionContext())
    monkeypatch.setattr(
        "src.modules.commerce.billing_payment_reconciliation_service.write_required_activity_event",
        lambda **_: _completed_audit(),
    )

    result = await service.reconcile(
        facts=_facts(),
        actor_user_id=uuid4(),
        reason="Missing local projection",
        evidence_reference="case-43",
        idempotency_key="correction-2",
    )

    assert result.disposition == CommercePaymentCorrectionDisposition.RECONCILIATION_REQUIRED
    assert result.failure_code == "BILLING_PAYMENT_RECONCILIATION_REQUIRED"
    assert result.credit_consequence is None


@pytest.mark.asyncio
async def test_idempotency_conflict_does_not_create_second_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    existing = SimpleNamespace(
        id=uuid4(),
        request_fingerprint="different",
    )
    service = BillingPaymentReconciliationService(
        settings=cast(Settings, SimpleNamespace()),
        store=cast(PaymentCorrectionStore, _TransactionStore(transaction=None, existing=existing)),
    )
    monkeypatch.setattr(service, "tx", lambda: _TransactionContext())

    with pytest.raises(Exception) as exc:
        await service.reconcile(
            facts=_facts(),
            actor_user_id=uuid4(),
            reason="Conflict",
            evidence_reference="case-44",
            idempotency_key="correction-3",
        )

    assert "IDEMPOTENCY_CONFLICT" in str(exc.value)


def test_refund_identity_requires_status() -> None:
    with pytest.raises(ValidationError):
        _facts(refund_status=None)


async def _completed_audit() -> SimpleNamespace:
    return SimpleNamespace(id=uuid4())
