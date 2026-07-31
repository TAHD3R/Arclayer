from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class CommercialAccessState(StrEnum):
    NORMAL = "normal"
    PAYMENT_GRACE = "payment_grace"
    PAYMENT_RESTRICTED = "payment_restricted"


class ProviderDunningFactKind(StrEnum):
    PAYMENT_FAILURE = "payment_failure"
    PAYMENT_RECOVERED = "payment_recovered"
    FINAL_UNPAID = "final_unpaid"


class ProviderDunningFact(BaseSchema):
    """Provider event context before signature verification."""

    workspace_id: UUID
    subscription_revision_id: UUID
    provider: str = Field(min_length=1, max_length=32)
    provider_event_id: str = Field(min_length=1, max_length=255)
    provider_period_id: str = Field(min_length=1, max_length=255)
    kind: ProviderDunningFactKind
    occurred_at: datetime
    recovery_deadline: datetime | None = None
    source_payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_provider_recovery_metadata(self) -> ProviderDunningFact:
        if len(f"provider:{self.provider}:{self.provider_event_id}") > 255:
            raise ValueError("provider event identity exceeds durable source identity limit")
        if self.occurred_at.utcoffset() is None:
            raise ValueError("occurred_at must be timezone-aware")
        if self.kind == ProviderDunningFactKind.PAYMENT_FAILURE:
            if self.recovery_deadline is None:
                raise ValueError("payment failure requires provider recovery deadline")
            if self.recovery_deadline.utcoffset() is None or self.recovery_deadline <= self.occurred_at:
                raise ValueError("provider recovery deadline must be after event time")
        elif self.recovery_deadline is not None:
            raise ValueError("only payment failure may carry recovery deadline")
        return self


class VerifiedProviderDunningFact(ProviderDunningFact):
    """A dunning fact accepted by the injected signature verifier."""

    signature_reference: str = Field(min_length=1, max_length=255)


class ProviderDunningTransitionRequest(BaseSchema):
    source: ProviderDunningFact
    expected_access_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=160)


class CommercialAccessProjection(BaseSchema):
    workspace_id: UUID
    subscription_revision_id: UUID
    provider: str
    provider_period_id: str
    state: CommercialAccessState
    recovery_deadline: datetime | None
    access_revision: int = Field(ge=1)
    source_event_id: str
    effective_at: datetime

    @model_validator(mode="after")
    def validate_state_deadline(self) -> CommercialAccessProjection:
        requires_deadline = self.state == CommercialAccessState.PAYMENT_GRACE
        if requires_deadline != (self.recovery_deadline is not None):
            raise ValueError("only payment_grace has a recovery deadline")
        return self


class CommercialAccessTransitionFact(BaseSchema):
    workspace_id: UUID
    transition_identity: str
    source_event_id: str
    from_state: CommercialAccessState
    to_state: CommercialAccessState
    effective_at: datetime
    recovery_deadline: datetime | None = None


class CommercialLifecycleNotificationFact(BaseSchema):
    workspace_id: UUID
    transition_identity: str
    milestone: str
    effective_at: datetime
    recovery_deadline: datetime | None = None


class HostingCommercialAccessHandoffFact(BaseSchema):
    workspace_id: UUID
    transition_identity: str
    state: CommercialAccessState
    cause: str
    effective_at: datetime


class CommercialAccessStateApplyResult(BaseSchema):
    projection: CommercialAccessProjection
    transition: CommercialAccessTransitionFact
    notification: CommercialLifecycleNotificationFact
    hosting_handoff: HostingCommercialAccessHandoffFact | None = None


class CommercialAccessTransitionWrite(BaseSchema):
    source: VerifiedProviderDunningFact
    expected_access_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=160)
    projection: CommercialAccessProjection
    result: CommercialAccessStateApplyResult


class PaymentRecoveryGrantRequest(BaseSchema):
    """Grant decision input accepted only after Provider signature verification."""

    source: VerifiedProviderDunningFact
    expected_access_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=160)


class PaymentRecoveryGrantDecision(BaseSchema):
    workspace_id: UUID
    provider: str
    provider_period_id: str
    subscription_revision_id: UUID
    source_event_id: str
    grant_required: bool
    decision_identity: str


class PaymentRecoveryGrantWrite(BaseSchema):
    expected_access_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=160)
    decision: PaymentRecoveryGrantDecision


class CommercialAccessMemberView(BaseSchema):
    """Sanitized access state visible to every active Workspace member."""

    workspace_id: PublicUUID
    state: CommercialAccessState
    explanation_key: str | None = None
    billing_contact_required: bool = False


class CommercialAccessRecoveryView(CommercialAccessMemberView):
    """Billing-contact view with the executable, server-revalidated recovery action."""

    recovery_deadline: datetime | None = None
    permitted_recovery_action: str | None = None
