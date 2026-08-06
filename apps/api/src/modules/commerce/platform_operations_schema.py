"""Platform-only Commerce operations contracts.

These schemas deliberately exclude tenant checkout URLs, payment instruments, and
raw Provider payloads. Platform operators investigate and repair commercial state;
they never act as tenant billing contacts.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, SecretStr, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.billing import BillingProviderMode, SubscriptionTransitionStatus
from src.models.commerce.payments import CommerceRefundStatus
from src.models.connectors.inbox import ConnectorEventInboxStatus


class ProviderReadinessOut(BaseSchema):
    provider: str
    configured: bool
    webhook_ready: bool
    connector_registered: bool
    supported_capabilities: tuple[str, ...]
    missing_prerequisites: tuple[str, ...]


class SimulatorReadinessOut(BaseSchema):
    enabled: bool
    environment: str
    provider: str
    signing_configured: bool
    connector_registered: bool
    supported_outcomes: tuple[Literal["pending", "succeeded", "failed", "canceled"], ...]
    rejection_code: str | None = None


class ProviderConfigurationWrite(BaseSchema):
    provider: str = Field(min_length=1, max_length=32)
    mode: BillingProviderMode
    expected_revision: int = Field(ge=0)
    secret: SecretStr | None = None
    webhook_secret: SecretStr | None = None
    idempotency_key: str = Field(min_length=1, max_length=128)


class ProviderConfigurationWriteOut(BaseSchema):
    provider: str
    mode: BillingProviderMode
    revision: int = Field(ge=1)
    configured: bool


class DunningPolicyOut(BaseSchema):
    provider: str
    provider_mode: BillingProviderMode
    revision: int = Field(ge=1)
    is_active: bool
    policy: dict[str, object]


class DunningPolicyWrite(BaseSchema):
    provider: str = Field(min_length=1, max_length=32)
    provider_mode: BillingProviderMode
    expected_revision: int = Field(ge=0)
    policy: dict[str, object]
    idempotency_key: str = Field(min_length=1, max_length=128)


class ProviderEventOut(BaseSchema):
    id: PublicUUID
    provider: str
    provider_mode: str
    provider_account_id: str
    provider_event_id: str
    event_type: str
    signature_timestamp: datetime
    payload_sha256: str
    status: str
    processing_attempts: int
    job_id: PublicUUID | None = None
    processed_at: datetime | None = None
    last_error_code: str | None = None
    last_error_message: str | None = None
    result_reference: dict[str, object] | None = None


class ProviderEventListOut(BaseSchema):
    items: tuple[ProviderEventOut, ...]
    total: int


class ProviderEventQuery(BaseSchema):
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 50
    provider: str | None = None
    status: ConnectorEventInboxStatus | None = None


class ProviderEventReconcileRequest(BaseSchema):
    expected_processing_attempts: int = Field(ge=0)
    idempotency_key: str = Field(min_length=1, max_length=128)


class TopUpRefundRequest(BaseSchema):
    reason: str = Field(min_length=1, max_length=1000)


class TopUpRefundOut(BaseSchema):
    refund_id: PublicUUID
    workspace_id: PublicUUID
    transaction_id: PublicUUID
    status: CommerceRefundStatus
    amount_micros: int = Field(gt=0)
    credit_amount: int = Field(gt=0)
    external_refund_id: str | None
    held_credits: int = Field(ge=0)


class CreditAdjustmentRequest(BaseSchema):
    delta_credits: int
    reason: str = Field(min_length=1, max_length=1000)
    evidence_reference: str = Field(min_length=1, max_length=255)
    expires_at: datetime | None
    expected_account_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def _require_nonzero_delta(self) -> CreditAdjustmentRequest:
        if self.delta_credits == 0:
            raise ValueError("delta_credits must not be zero")
        if self.delta_credits < 0 and self.expires_at is not None:
            raise ValueError("expires_at is only valid for positive adjustments")
        if self.expires_at is not None:
            if self.expires_at.tzinfo is None:
                raise ValueError("expires_at must include a timezone")
            if self.expires_at <= datetime.now(UTC):
                raise ValueError("expires_at must be in the future")
        return self


class CreditAdjustmentOut(BaseSchema):
    workspace_id: PublicUUID
    ledger_entry_id: PublicUUID
    account_revision: int = Field(ge=1)
    balance: int = Field(ge=0)
    reserved: int = Field(ge=0)
    available: int = Field(ge=0)
    audit_event_id: PublicUUID


class SubscriptionTransitionItemOut(BaseSchema):
    subscription_id: PublicUUID
    effective_at: datetime
    provider_schedule_id: str | None = None
    status: SubscriptionTransitionStatus
    result_code: str | None = None
    convergence_id: PublicUUID | None = None


class SubscriptionTransitionDetailOut(BaseSchema):
    id: PublicUUID
    source_plan_revision_id: PublicUUID
    target_plan_revision_id: PublicUUID
    actor_user_id: PublicUUID | None = None
    reason: str
    requested_at: datetime
    status: SubscriptionTransitionStatus
    revision: int = Field(ge=1)
    correlation_id: PublicUUID
    items: tuple[SubscriptionTransitionItemOut, ...]


class SubscriptionTransitionCancelRequest(BaseSchema):
    expected_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)


class CommercialCorrectionPreviewRequest(BaseSchema):
    source_revision_id: UUID
    target_revision_id: UUID
    expected_subscription_revision: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=1000)
    source_evidence: tuple[str, ...] = Field(min_length=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class CommercialCorrectionApplyPayload(BaseSchema):
    preview_id: UUID
    expected_preview_revision: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=1000)
    source_evidence: tuple[str, ...] = Field(min_length=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID
