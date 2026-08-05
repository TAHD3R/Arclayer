from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceInvoiceStatus,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)
from src.modules.commerce.billing_connector import ProviderInvoiceProjection, ProviderTransactionProjection
from src.modules.commerce.provider_payment_projection import (
    ProviderPaymentProjectionCommand,
    ProviderPaymentProjectionService,
)
from src.modules.commerce.provider_payment_projection_repository import ProviderPaymentProjectionStore


class _ProjectionStore:
    def __init__(self, *, invoice: Any, transaction: Any, latest_event_at: datetime) -> None:
        self.invoice = invoice
        self.transaction = transaction
        self.latest_invoice = SimpleNamespace(
            provider_account_id="platform",
            provider_event_occurred_at=latest_event_at,
        )
        self.latest_transaction = SimpleNamespace(provider_event_occurred_at=latest_event_at)
        self.receipt = SimpleNamespace(id=uuid4())
        self.transaction_snapshots: list[dict[str, object]] = []

    async def get_receipt(self, **_: object) -> None:
        return None

    async def get_invoice(self, **_: object) -> Any:
        return self.invoice

    async def latest_invoice_receipt(self, **_: object) -> Any:
        return self.latest_invoice

    async def create_invoice(self, **_: object) -> Any:
        raise AssertionError("existing invoice must be updated")

    async def get_transaction(self, **_: object) -> Any:
        return self.transaction

    async def latest_transaction_projection(self, **_: object) -> Any:
        return self.latest_transaction

    async def create_transaction(self, **_: object) -> Any:
        raise AssertionError("existing transaction must be updated")

    async def create_receipt(self, **_: object) -> Any:
        return self.receipt

    async def create_transaction_projection(self, *, values: dict[str, object], **_: object) -> None:
        self.transaction_snapshots.append(values)

    async def list_transaction_projections(self, **_: object) -> list[Any]:
        raise AssertionError("new application must not use replay projection lookup")


@pytest.mark.asyncio
async def test_later_provider_event_advances_existing_transaction_status() -> None:
    transaction_occurred_at = datetime(2026, 8, 5, 10, tzinfo=UTC)
    first_event_at = transaction_occurred_at + timedelta(minutes=1)
    later_event_at = first_event_at + timedelta(minutes=1)
    workspace_id = uuid4()
    subscription_id = uuid4()
    invoice_id = uuid4()
    transaction_id = uuid4()
    invoice = SimpleNamespace(
        id=invoice_id,
        workspace_id=workspace_id,
        subscription_id=subscription_id,
        currency="USD",
        amount_due_micros=9_000_000,
        amount_paid_micros=0,
        amount_refunded_micros=0,
        period_start=transaction_occurred_at,
        period_end=transaction_occurred_at + timedelta(days=30),
        issued_at=transaction_occurred_at,
        paid_at=None,
        status=CommerceInvoiceStatus.OPEN,
        save=AsyncMock(),
    )
    transaction = SimpleNamespace(
        id=transaction_id,
        workspace_id=workspace_id,
        subscription_id=subscription_id,
        invoice_id=invoice_id,
        kind=CommerceTransactionKind.RENEWAL,
        currency="USD",
        amount_micros=9_000_000,
        occurred_at=transaction_occurred_at,
        status=CommerceTransactionStatus.PENDING,
        provider_event_id="sim_evt_pending",
        save=AsyncMock(),
    )
    store = _ProjectionStore(invoice=invoice, transaction=transaction, latest_event_at=first_event_at)
    service = ProviderPaymentProjectionService(store=cast(ProviderPaymentProjectionStore, store))

    result = await service.apply(
        command=ProviderPaymentProjectionCommand(
            workspace_id=workspace_id,
            subscription_id=subscription_id,
            plan_revision_id=uuid4(),
            application_id=uuid4(),
            provider="simulated",
            provider_mode=BillingProviderMode.TEST,
            provider_account_id="platform",
            provider_event_id="sim_evt_succeeded",
            payload_sha256="a" * 64,
            signature_reference="simulated:t=1785924120:v1=digest",
        ),
        payment=ProviderInvoiceProjection(
            external_invoice_id="sim_in_projection",
            status=CommerceInvoiceStatus.PAID,
            currency="USD",
            amount_due_micros=9_000_000,
            amount_paid_micros=9_000_000,
            period_start=invoice.period_start,
            period_end=invoice.period_end,
            issued_at=invoice.issued_at,
            paid_at=later_event_at,
            occurred_at=later_event_at,
            transactions=(
                ProviderTransactionProjection(
                    external_transaction_id="sim_tx_projection",
                    kind=CommerceTransactionKind.RENEWAL,
                    status=CommerceTransactionStatus.SUCCEEDED,
                    currency="USD",
                    amount_micros=9_000_000,
                    occurred_at=transaction_occurred_at,
                ),
            ),
        ),
        conn=cast(Any, object()),
    )

    assert result.disposition == "applied"
    assert transaction.status == CommerceTransactionStatus.SUCCEEDED
    assert transaction.provider_event_id == "sim_evt_succeeded"
    transaction.save.assert_awaited_once()
    assert store.transaction_snapshots[0]["provider_event_occurred_at"] == later_event_at
