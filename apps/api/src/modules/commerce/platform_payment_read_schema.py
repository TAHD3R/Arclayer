from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.payments import (
    CommerceInvoiceStatus,
    CommerceRefundStatus,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)


class PlatformTransactionQuery(BaseSchema):
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 50
    provider: str | None = None
    status: CommerceTransactionStatus | None = None
    kind: CommerceTransactionKind | None = None
    search: str | None = Field(default=None, max_length=200)
    sort_by: Literal["occurred_at", "amount_micros", "status"] = "occurred_at"
    sort_direction: Literal["asc", "desc"] = "desc"


class PlatformTransactionOut(BaseSchema):
    transaction_id: PublicUUID
    workspace_id: PublicUUID
    external_transaction_id: str
    provider: str
    provider_mode: str
    kind: CommerceTransactionKind
    status: CommerceTransactionStatus
    currency: str
    amount_micros: int
    credit_amount: int | None
    checkout_session_id: PublicUUID | None
    invoice_id: PublicUUID | None
    occurred_at: datetime


class PlatformTransactionListOut(BaseSchema):
    items: tuple[PlatformTransactionOut, ...]
    total: int


class PlatformInvoiceQuery(BaseSchema):
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 50
    provider: str | None = None
    status: CommerceInvoiceStatus | None = None
    search: str | None = Field(default=None, max_length=200)
    sort_by: Literal["issued_at", "amount_due_micros", "status"] = "issued_at"
    sort_direction: Literal["asc", "desc"] = "desc"


class PlatformInvoiceOut(BaseSchema):
    invoice_id: PublicUUID
    workspace_id: PublicUUID
    external_invoice_id: str
    provider: str
    provider_mode: str
    status: CommerceInvoiceStatus
    currency: str
    amount_due_micros: int
    amount_paid_micros: int
    amount_refunded_micros: int
    period_start: datetime | None
    period_end: datetime | None
    issued_at: datetime
    paid_at: datetime | None
    transaction_ids: tuple[PublicUUID, ...]


class PlatformInvoiceListOut(BaseSchema):
    items: tuple[PlatformInvoiceOut, ...]
    total: int


class PlatformRefundQuery(BaseSchema):
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 50
    status: CommerceRefundStatus | None = None
    search: str | None = Field(default=None, max_length=200)
    sort_by: Literal["created_at", "amount_micros", "status"] = "created_at"
    sort_direction: Literal["asc", "desc"] = "desc"


class PlatformRefundOut(BaseSchema):
    refund_id: PublicUUID
    workspace_id: PublicUUID
    transaction_id: PublicUUID
    status: CommerceRefundStatus
    amount_micros: int
    credit_amount: int | None
    reason: str
    external_refund_id: str | None
    provider_event_id: str | None
    completed_at: datetime | None
    failure_code: str | None


class PlatformRefundListOut(BaseSchema):
    items: tuple[PlatformRefundOut, ...]
    total: int
