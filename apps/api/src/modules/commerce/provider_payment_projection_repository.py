from __future__ import annotations

from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceInvoice,
    CommerceProviderPaymentProjection,
    CommerceProviderPaymentTransactionProjection,
    CommerceTransaction,
)


class ProviderPaymentProjectionStore(Protocol):
    async def get_receipt(
        self, *, application_id: UUID, conn: BaseDBAsyncClient
    ) -> CommerceProviderPaymentProjection | None: ...

    async def get_invoice(
        self, *, provider: str, provider_mode: BillingProviderMode, external_id: str, conn: BaseDBAsyncClient
    ) -> CommerceInvoice | None: ...

    async def latest_invoice_receipt(
        self, *, invoice_id: UUID, conn: BaseDBAsyncClient
    ) -> CommerceProviderPaymentProjection | None: ...

    async def create_invoice(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> CommerceInvoice: ...

    async def get_transaction(
        self, *, provider: str, provider_mode: BillingProviderMode, external_id: str, conn: BaseDBAsyncClient
    ) -> CommerceTransaction | None: ...

    async def latest_transaction_projection(
        self, *, transaction_id: UUID, conn: BaseDBAsyncClient
    ) -> CommerceProviderPaymentTransactionProjection | None: ...

    async def create_transaction(
        self, *, values: dict[str, object], conn: BaseDBAsyncClient
    ) -> CommerceTransaction: ...

    async def create_receipt(
        self, *, values: dict[str, object], conn: BaseDBAsyncClient
    ) -> CommerceProviderPaymentProjection: ...

    async def create_transaction_projection(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> None: ...

    async def list_transaction_projections(
        self, *, receipt_id: UUID, conn: BaseDBAsyncClient
    ) -> list[CommerceProviderPaymentTransactionProjection]: ...


class TortoiseProviderPaymentProjectionStore:
    async def get_receipt(
        self, *, application_id: UUID, conn: BaseDBAsyncClient
    ) -> CommerceProviderPaymentProjection | None:
        return await (
            CommerceProviderPaymentProjection
            .filter(application_id=application_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def get_invoice(
        self, *, provider: str, provider_mode: BillingProviderMode, external_id: str, conn: BaseDBAsyncClient
    ) -> CommerceInvoice | None:
        return await (
            CommerceInvoice
            .filter(
                provider=provider,
                provider_mode=provider_mode,
                external_invoice_id=external_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def latest_invoice_receipt(
        self, *, invoice_id: UUID, conn: BaseDBAsyncClient
    ) -> CommerceProviderPaymentProjection | None:
        return await (
            CommerceProviderPaymentProjection
            .filter(invoice_id=invoice_id)
            .using_db(conn)
            .order_by("-provider_event_occurred_at", "-created_at")
            .first()
        )

    async def create_invoice(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> CommerceInvoice:
        return await CommerceInvoice.create(using_db=conn, **values)

    async def get_transaction(
        self, *, provider: str, provider_mode: BillingProviderMode, external_id: str, conn: BaseDBAsyncClient
    ) -> CommerceTransaction | None:
        return await (
            CommerceTransaction
            .filter(
                provider=provider,
                provider_mode=provider_mode,
                external_transaction_id=external_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def latest_transaction_projection(
        self, *, transaction_id: UUID, conn: BaseDBAsyncClient
    ) -> CommerceProviderPaymentTransactionProjection | None:
        return await (
            CommerceProviderPaymentTransactionProjection
            .filter(transaction_id=transaction_id)
            .using_db(conn)
            .order_by("-provider_event_occurred_at", "-created_at")
            .first()
        )

    async def create_transaction(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> CommerceTransaction:
        return await CommerceTransaction.create(using_db=conn, **values)

    async def create_receipt(
        self, *, values: dict[str, object], conn: BaseDBAsyncClient
    ) -> CommerceProviderPaymentProjection:
        return await CommerceProviderPaymentProjection.create(using_db=conn, **values)

    async def create_transaction_projection(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> None:
        await CommerceProviderPaymentTransactionProjection.create(using_db=conn, **values)

    async def list_transaction_projections(
        self, *, receipt_id: UUID, conn: BaseDBAsyncClient
    ) -> list[CommerceProviderPaymentTransactionProjection]:
        return await (
            CommerceProviderPaymentTransactionProjection
            .filter(payment_projection_id=receipt_id)
            .using_db(conn)
            .prefetch_related("transaction")
            .all()
        )
