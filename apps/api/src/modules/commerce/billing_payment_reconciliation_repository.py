from __future__ import annotations

from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceInvoice,
    CommercePaymentCorrection,
    CommerceProviderPaymentTransactionProjection,
    CommerceRefund,
    CommerceTopUpSettlementApplication,
    CommerceTransaction,
)


class PaymentCorrectionStore(Protocol):
    async def get_by_idempotency(
        self, *, idempotency_key: str, conn: BaseDBAsyncClient
    ) -> CommercePaymentCorrection | None: ...

    async def get_by_event(
        self,
        *,
        provider: str,
        provider_mode: BillingProviderMode,
        provider_account_id: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommercePaymentCorrection | None: ...

    async def get_transaction(
        self,
        *,
        provider: str,
        provider_mode: BillingProviderMode,
        provider_account_id: str,
        external_transaction_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceTransaction | None: ...

    async def get_invoice(
        self,
        *,
        provider: str,
        provider_mode: BillingProviderMode,
        external_invoice_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceInvoice | None: ...

    async def get_refund(self, *, external_refund_id: str, conn: BaseDBAsyncClient) -> CommerceRefund | None: ...

    async def get_provider_account_id(self, *, transaction_id: UUID, conn: BaseDBAsyncClient) -> str | None: ...

    async def create(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> CommercePaymentCorrection: ...


class TortoisePaymentCorrectionStore:
    async def get_by_idempotency(
        self, *, idempotency_key: str, conn: BaseDBAsyncClient
    ) -> CommercePaymentCorrection | None:
        return await (
            CommercePaymentCorrection.filter(idempotency_key=idempotency_key).using_db(conn).select_for_update().first()
        )

    async def get_by_event(
        self,
        *,
        provider: str,
        provider_mode: BillingProviderMode,
        provider_account_id: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommercePaymentCorrection | None:
        return await (
            CommercePaymentCorrection
            .filter(
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                provider_event_id=provider_event_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def get_transaction(
        self,
        *,
        provider: str,
        provider_mode: BillingProviderMode,
        provider_account_id: str,
        external_transaction_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceTransaction | None:
        return await (
            CommerceTransaction
            .filter(
                provider=provider,
                provider_mode=provider_mode,
                external_transaction_id=external_transaction_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def get_invoice(
        self,
        *,
        provider: str,
        provider_mode: BillingProviderMode,
        external_invoice_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceInvoice | None:
        return await (
            CommerceInvoice
            .filter(
                provider=provider,
                provider_mode=provider_mode,
                external_invoice_id=external_invoice_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def get_refund(self, *, external_refund_id: str, conn: BaseDBAsyncClient) -> CommerceRefund | None:
        return await (
            CommerceRefund.filter(external_refund_id=external_refund_id).using_db(conn).select_for_update().first()
        )

    async def get_provider_account_id(self, *, transaction_id: UUID, conn: BaseDBAsyncClient) -> str | None:
        settlement = await (
            CommerceTopUpSettlementApplication
            .filter(transaction_id=transaction_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if settlement is not None:
            return settlement.provider_account_id
        projection = await (
            CommerceProviderPaymentTransactionProjection
            .filter(transaction_id=transaction_id)
            .using_db(conn)
            .select_related("payment_projection")
            .order_by("-provider_event_occurred_at", "-created_at")
            .first()
        )
        return None if projection is None else projection.payment_projection.provider_account_id

    async def create(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> CommercePaymentCorrection:
        return await CommercePaymentCorrection.create(using_db=conn, **values)


def build_payment_correction_store() -> PaymentCorrectionStore:
    return TortoisePaymentCorrectionStore()
