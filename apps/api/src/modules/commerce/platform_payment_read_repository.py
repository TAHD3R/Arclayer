from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.expressions import Q

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.payments import CommerceInvoice, CommerceRefund, CommerceTransaction
from src.modules.commerce.platform_payment_read_schema import (
    PlatformInvoiceQuery,
    PlatformRefundQuery,
    PlatformTransactionQuery,
)


class PlatformPaymentReadRepository(TortoiseORMRepository[CommerceTransaction]):
    def __init__(self) -> None:
        super().__init__(CommerceTransaction)

    async def list_transactions(self, *, query: PlatformTransactionQuery) -> tuple[list[CommerceTransaction], int]:
        rows: Any = CommerceTransaction.all().select_related("checkout_session", "invoice")
        if query.provider is not None:
            rows = rows.filter(provider=query.provider)
        if query.status is not None:
            rows = rows.filter(status=query.status)
        if query.kind is not None:
            rows = rows.filter(kind=query.kind)
        if query.search:
            search_filter = Q(provider__icontains=query.search.strip()) | Q(
                external_transaction_id__icontains=query.search.strip()
            )
            search_id = _parse_uuid(query.search)
            if search_id is not None:
                search_filter = search_filter | Q(id=search_id) | Q(workspace_id=search_id)
            rows = rows.filter(search_filter)
        total = int(await rows.count())
        offset = (query.page - 1) * query.page_size
        return await rows.order_by(*_ordering(query.sort_by, query.sort_direction)).offset(offset).limit(
            query.page_size
        ), total

    async def list_invoices(
        self, *, query: PlatformInvoiceQuery
    ) -> tuple[list[CommerceInvoice], int, dict[UUID, tuple[UUID, ...]]]:
        rows: Any = CommerceInvoice.all()
        if query.provider is not None:
            rows = rows.filter(provider=query.provider)
        if query.status is not None:
            rows = rows.filter(status=query.status)
        if query.search:
            search_filter = Q(provider__icontains=query.search.strip()) | Q(
                external_invoice_id__icontains=query.search.strip()
            )
            search_id = _parse_uuid(query.search)
            if search_id is not None:
                search_filter = search_filter | Q(id=search_id) | Q(workspace_id=search_id)
            rows = rows.filter(search_filter)
        total = int(await rows.count())
        offset = (query.page - 1) * query.page_size
        invoices = (
            await rows.order_by(*_ordering(query.sort_by, query.sort_direction)).offset(offset).limit(query.page_size)
        )
        invoice_ids = [invoice.id for invoice in invoices]
        transactions = await CommerceTransaction.filter(invoice_id__in=invoice_ids).order_by("id")
        transaction_ids: dict[UUID, list[UUID]] = {invoice_id: [] for invoice_id in invoice_ids}
        for transaction in transactions:
            if transaction.invoice_id is not None:
                transaction_ids[transaction.invoice_id].append(transaction.id)
        return invoices, total, {invoice_id: tuple(ids) for invoice_id, ids in transaction_ids.items()}

    async def list_refunds(self, *, query: PlatformRefundQuery) -> tuple[list[CommerceRefund], int]:
        rows: Any = CommerceRefund.all().select_related("transaction")
        if query.status is not None:
            rows = rows.filter(status=query.status)
        if query.search:
            normalized = query.search.strip()
            search_filter = (
                Q(reason__icontains=normalized)
                | Q(external_refund_id__icontains=normalized)
                | Q(provider_event_id__icontains=normalized)
            )
            search_id = _parse_uuid(normalized)
            if search_id is not None:
                search_filter = search_filter | Q(id=search_id) | Q(transaction_id=search_id)
            rows = rows.filter(search_filter)
        total = int(await rows.count())
        offset = (query.page - 1) * query.page_size
        return await rows.order_by(*_ordering(query.sort_by, query.sort_direction)).offset(offset).limit(
            query.page_size
        ), total


def _ordering(field: str, direction: str) -> tuple[str, str]:
    prefix = "-" if direction == "desc" else ""
    return (f"{prefix}{field}", f"{prefix}id")


def _parse_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value.strip())
    except ValueError:
        return None
