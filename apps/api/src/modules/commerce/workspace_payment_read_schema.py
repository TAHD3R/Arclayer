from __future__ import annotations

from datetime import datetime

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.payments import CommerceInvoiceStatus


class WorkspaceInvoiceOut(BaseSchema):
    invoice_id: PublicUUID
    external_invoice_id: str
    status: CommerceInvoiceStatus
    currency: str
    amount_due_micros: int
    amount_paid_micros: int
    amount_refunded_micros: int
    period_start: datetime | None
    period_end: datetime | None
    issued_at: datetime
    paid_at: datetime | None
