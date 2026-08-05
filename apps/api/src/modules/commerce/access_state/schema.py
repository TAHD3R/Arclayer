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
    provider_mode: str = Field(pattern="^(test|live)$")
    provider_account_id: str = Field(min_length=1, max_length=255)
    provider_event_id: str = Field(min_length=1, max_length=255)
    provider_period_id: str = Field(min_length=1, max_length=255)
    provider_period_start: datetime
    provider_period_end: datetime
    kind: ProviderDunningFactKind
    occurred_at: datetime
    recovery_deadline: datetime | None = None
    source_payload_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_provider_recovery_metadata(self) -> ProviderDunningFact:
        if self.occurred_at.utcoffset() is None:
            raise ValueError("occurred_at must be timezone-aware")
        if self.provider_period_start.utcoffset() is None or self.provider_period_end.utcoffset() is None:
            raise ValueError("provider period boundaries must be timezone-aware")
        if self.provider_period_end <= self.provider_period_start:
            raise ValueError("provider period end must be after period start")
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


class ResolvedDunningPolicy(BaseSchema):
    """Exact active Provider/mode policy revision used for one transition."""

    policy_id: UUID
    provider: str = Field(min_length=1, max_length=32)
    provider_mode: str = Field(pattern="^(test|live)$")
    revision: int = Field(ge=1)


class ProviderDunningTransitionRequest(BaseSchema):
    source: ProviderDunningFact
    policy: ResolvedDunningPolicy
    expected_access_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=160)


class CommercialAccessProjection(BaseSchema):
    workspace_id: UUID
    subscription_revision_id: UUID
    provider: str
    provider_mode: str | None = Field(default=None, pattern="^(test|live)$")
    provider_period_id: str
    provider_period_start: datetime | None = None
    provider_period_end: datetime | None = None
    state: CommercialAccessState
    recovery_deadline: datetime | None
    access_revision: int = Field(ge=1)
    source_event_id: str
    source_occurred_at: datetime | None = None
    dunning_policy_revision: int | None = Field(default=None, ge=1)
    effective_at: datetime

    @model_validator(mode="after")
    def validate_state_deadline(self) -> CommercialAccessProjection:
        requires_deadline = self.state == CommercialAccessState.PAYMENT_GRACE
        if requires_deadline != (self.recovery_deadline is not None):
            raise ValueError("only payment_grace has a recovery deadline")
        if (self.provider_period_start is None) != (self.provider_period_end is None):
            raise ValueError("provider period boundaries must be both present or both absent")
        if (
            self.provider_period_start is not None
            and self.provider_period_end is not None
            and self.provider_period_end <= self.provider_period_start
        ):
            raise ValueError("provider period end must be after period start")
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


class CommercialAccessApplyDisposition(StrEnum):
    TRANSITIONED = "transitioned"
    REPLAYED = "replayed"
    STALE_IGNORED = "stale_ignored"
    STATE_REGRESSION_IGNORED = "state_regression_ignored"
    STATE_REPEAT_IGNORED = "state_repeat_ignored"


class CommercialAccessStateApplyOutcome(BaseSchema):
    result: CommercialAccessStateApplyResult
    disposition: CommercialAccessApplyDisposition

    @property
    def transitioned(self) -> bool:
        return self.disposition == CommercialAccessApplyDisposition.TRANSITIONED


class CommercialAccessTransitionWrite(BaseSchema):
    source: VerifiedProviderDunningFact
    policy: ResolvedDunningPolicy
    expected_access_revision: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=160)
    projection: CommercialAccessProjection
    result: CommercialAccessStateApplyResult


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
