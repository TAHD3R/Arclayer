from __future__ import annotations

from datetime import datetime

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class SimulatorCheckoutOut(BaseSchema):
    id: PublicUUID
    external_session_id: str
    kind: str
    provider: str
    provider_mode: str
    provider_account_id: str
    status: str
    currency: str
    amount_micros: int
    credit_amount: int | None
    external_price_id: str
    actor_user_id: PublicUUID
    revision: int
    expires_at: datetime
    completed_at: datetime | None


class SimulatorOutcomeCommandOut(BaseSchema):
    id: PublicUUID
    checkout_session_id: PublicUUID
    actor_user_id: PublicUUID
    outcome: str
    expected_revision: int
    provider_event_id: str
    accepted_inbox_id: PublicUUID | None
    accepted_job_id: PublicUUID | None
    processed_at: datetime | None
    result_status: str | None
    result_revision: int | None


class SimulatorInboxOut(BaseSchema):
    id: PublicUUID
    provider: str
    provider_mode: str
    provider_account_id: str
    provider_event_id: str
    event_type: str
    status: str
    processing_attempts: int
    job_id: PublicUUID | None
    processed_at: datetime | None
    last_error_code: str | None


class SimulatorJobOut(BaseSchema):
    id: PublicUUID
    job_type: str
    internal_status: str
    workspace_id: PublicUUID | None
    attempt_count: int
    next_attempt_at: datetime | None
    completed_at: datetime | None
    error_code: str | None


class SimulatorTransactionOut(BaseSchema):
    id: PublicUUID
    external_transaction_id: str
    provider: str
    provider_mode: str
    kind: str
    status: str
    currency: str
    amount_micros: int
    credit_amount: int | None
    checkout_session_id: PublicUUID | None
    invoice_id: PublicUUID | None
    occurred_at: datetime


class SimulatorInvoiceOut(BaseSchema):
    id: PublicUUID
    external_invoice_id: str
    provider: str
    provider_mode: str
    status: str
    currency: str
    amount_due_micros: int
    amount_paid_micros: int
    amount_refunded_micros: int
    issued_at: datetime
    paid_at: datetime | None


class SimulatorRefundOut(BaseSchema):
    id: PublicUUID
    transaction_id: PublicUUID
    status: str
    amount_micros: int
    credit_amount: int | None
    external_refund_id: str | None
    provider_event_id: str | None
    completed_at: datetime | None
    failure_code: str | None


class SimulatorApplicationOut(BaseSchema):
    id: PublicUUID
    checkout_session_id: PublicUUID
    transaction_id: PublicUUID | None
    invoice_id: PublicUUID | None
    provider: str
    provider_mode: str
    provider_account_id: str
    provider_event_id: str
    outcome: str
    result_status: str
    result_revision: int
    applied_at: datetime


class SimulatorCorrectionOut(BaseSchema):
    id: PublicUUID
    transaction_id: PublicUUID | None
    invoice_id: PublicUUID | None
    refund_id: PublicUUID | None
    provider: str
    provider_mode: str
    provider_account_id: str
    provider_event_id: str
    disposition: str
    failure_code: str | None
    provider_event_occurred_at: datetime


class SimulatorStateOut(BaseSchema):
    workspace_id: PublicUUID
    checkouts: tuple[SimulatorCheckoutOut, ...]
    outcome_commands: tuple[SimulatorOutcomeCommandOut, ...]
    inboxes: tuple[SimulatorInboxOut, ...]
    jobs: tuple[SimulatorJobOut, ...]
    transactions: tuple[SimulatorTransactionOut, ...]
    invoices: tuple[SimulatorInvoiceOut, ...]
    refunds: tuple[SimulatorRefundOut, ...]
    applications: tuple[SimulatorApplicationOut, ...]
    corrections: tuple[SimulatorCorrectionOut, ...]
