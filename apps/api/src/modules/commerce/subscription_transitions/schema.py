from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.modules.commerce.convergence.schema import PlanRevisionRef


class ProviderRevisionSchedulingFacts(BaseSchema):
    """Exact non-secret Provider facts required to schedule one Revision transition."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    provider: str = Field(min_length=1, max_length=32)
    provider_mode: str = Field(pattern="^(test|live)$")
    external_subscription_id: str = Field(min_length=1, max_length=128)
    external_price_id: str = Field(min_length=1, max_length=255)
    billing_cycle: str = Field(pattern="^(monthly|yearly)$")
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    amount_micros: int = Field(ge=0)
    effective_at: datetime


class ProviderConfirmedTransitionEvidence(BaseSchema):
    """Verified Provider evidence required to reconcile a scheduled target Revision."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    provider_schedule_id: str = Field(min_length=1, max_length=255)
    target_revision_id: UUID
    effective_at: datetime


class RenewalTransitionPreview(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    id: UUID
    workspace_id: UUID
    source_revision: PlanRevisionRef
    target_revision: PlanRevisionRef
    expected_subscription_revision: int = Field(ge=1)
    effective_at: datetime
    preview_revision: int = Field(ge=1)
    preview_hash: str = Field(min_length=1)
    provider_price_covered: bool
    provider_scheduling: ProviderRevisionSchedulingFacts | None
    incompatible_lifecycle_states: tuple[str, ...]
    requires_convergence: bool = False
    convergence_id: UUID | None = None
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID

    @model_validator(mode="after")
    def _validate_pair(self) -> RenewalTransitionPreview:
        if self.source_revision.id == self.target_revision.id:
            raise ValueError("renewal transition source and target revisions must differ")
        if self.requires_convergence != (self.convergence_id is not None):
            raise ValueError("renewal transition convergence identity must match its requirement")
        if self.provider_price_covered != (self.provider_scheduling is not None):
            raise ValueError("provider scheduling facts must match target Price coverage")
        if self.provider_scheduling is not None and self.provider_scheduling.effective_at != self.effective_at:
            raise ValueError("provider scheduling facts must match the transition effective boundary")
        return self


class RenewalTransitionScheduleRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    preview_id: UUID
    expected_preview_revision: int = Field(ge=1)
    convergence_id: UUID | None = None
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class RenewalTransitionScheduleOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    transition_id: UUID
    provider_schedule_id: str | None
    effective_at: datetime
    correlation_id: UUID
    convergence_id: UUID | None = None


class CommercialCorrectionRequest(BaseSchema):
    """Immediate repair, intentionally separate from a renewal transition."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    workspace_id: UUID
    source_revision_id: UUID
    target_revision_id: UUID
    reason: str = Field(min_length=1, max_length=1000)
    source_evidence: tuple[str, ...] = Field(min_length=1)
    expected_subscription_revision: int | None = Field(default=None, ge=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID

    @model_validator(mode="after")
    def _validate_scope(self) -> CommercialCorrectionRequest:
        if self.source_revision_id == self.target_revision_id:
            raise ValueError("commercial correction source and target revisions must differ")
        return self


class CommercialCorrectionPreview(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    id: UUID
    workspace_id: UUID
    source_revision: PlanRevisionRef
    target_revision: PlanRevisionRef
    provider_consequences: tuple[str, ...]
    proration_consequences: tuple[str, ...]
    credit_consequences: tuple[str, ...]
    entitlement_consequences: tuple[str, ...]
    period_consequences: tuple[str, ...]
    preview_revision: int = Field(ge=1)
    preview_hash: str = Field(min_length=1)
    correlation_id: UUID


class CommercialCorrectionApplyRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    preview_id: UUID
    expected_preview_revision: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=1000)
    source_evidence: tuple[str, ...] = Field(min_length=1)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class SubscriptionTransitionAuditEvent(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    event_name: str
    workspace_id: UUID
    correlation_id: UUID
    idempotency_key: str
    actor_user_id: UUID | None = None
