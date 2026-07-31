from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema


class PlanRevisionRef(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    id: UUID
    plan_id: UUID
    code: str = Field(min_length=1)
    is_free: bool
    roles_manage_included: bool = True
    member_seat_limits: dict[str, int | None] = Field(default_factory=dict)


class MemberImpact(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    membership_id: UUID
    user_id: UUID
    display_name: str


class RoleResponsibilityImpact(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    assignment_id: UUID
    membership_id: UUID
    user_id: UUID
    role_id: UUID
    role_name: str


class CustomRoleImpact(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    role_id: UUID
    role_name: str


class FeatureSeatAssignmentImpact(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    assignment_id: UUID
    membership_id: UUID
    user_id: UUID
    entitlement_key: str
    name_i18n_key: str
    description_i18n_key: str


class FeatureAccessScopeRevisionImpact(BaseSchema):
    """Reviewed serialization revision for one Feature Seat allocation scope."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    entitlement_key: str
    revision: int = Field(ge=0)


class InvitationImpact(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    invitation_id: UUID
    recipient_label: str
    role_id: UUID | None = None


class QueuedEffectImpact(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    effect_id: UUID
    actor_user_id: UUID
    effect_type: str


class ConvergenceImpactSnapshot(BaseSchema):
    """Named authority and allocation consequences for one exact revision pair."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    workspace_id: UUID
    owner_user_id: UUID
    subscription_revision: int = Field(ge=1)
    source_revision: PlanRevisionRef
    target_revision: PlanRevisionRef
    requires_convergence: bool
    active_members: tuple[MemberImpact, ...]
    role_responsibilities: tuple[RoleResponsibilityImpact, ...]
    custom_roles: tuple[CustomRoleImpact, ...]
    billing_managers: tuple[MemberImpact, ...]
    feature_seat_managers: tuple[MemberImpact, ...]
    feature_assignments: tuple[FeatureSeatAssignmentImpact, ...]
    feature_allocation_scope_revisions: tuple[FeatureAccessScopeRevisionImpact, ...]
    email_invitations: tuple[InvitationImpact, ...]
    reusable_invitation_links: tuple[InvitationImpact, ...]
    queued_effects: tuple[QueuedEffectImpact, ...]


class ConvergencePreviewRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    workspace_id: UUID
    source_revision_id: UUID
    target_revision_id: UUID
    expected_subscription_revision: int = Field(ge=1)
    effective_at: datetime
    retained_assignment_ids: tuple[UUID, ...]
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID

    @model_validator(mode="after")
    def _validate_revision_pair(self) -> ConvergencePreviewRequest:
        if self.source_revision_id == self.target_revision_id:
            raise ValueError("source and target revisions must differ")
        if len(self.retained_assignment_ids) != len(set(self.retained_assignment_ids)):
            raise ValueError("retained assignments must be unique")
        return self


class ConvergencePreview(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    id: UUID
    preview_revision: int = Field(ge=1)
    snapshot_hash: str = Field(min_length=1)
    effective_at: datetime
    snapshot: ConvergenceImpactSnapshot
    retained_assignment_ids: tuple[UUID, ...]
    idempotency_key: str
    correlation_id: UUID
    is_applied: bool = False


class ProviderConfirmedConvergenceApplication(BaseSchema):
    """Internal-only evidence that a signed Provider event reached the reviewed boundary."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    preview_id: UUID
    workspace_id: UUID
    target_revision_id: UUID
    effective_at: datetime
    provider_event_id: str = Field(min_length=1, max_length=255)
    idempotency_key: str = Field(min_length=1, max_length=128)
    correlation_id: UUID


class FeatureAccessConvergenceCommand(BaseSchema):
    """Complete reviewed Feature Seat outcome passed into the Feature Access boundary."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    convergence_id: UUID
    workspace_id: UUID
    target_revision_id: UUID
    effective_at: datetime
    reviewed_assignment_ids: tuple[UUID, ...]
    retained_assignment_ids: tuple[UUID, ...]
    expected_scope_revisions: tuple[FeatureAccessScopeRevisionImpact, ...]
    idempotency_key: str = Field(min_length=1, max_length=128)


class ConvergenceReceipt(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    preview_id: UUID
    workspace_id: UUID
    applied_at: datetime
    replayed: bool = False
    correlation_id: UUID


class ConvergenceAuditEvent(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    event_name: str
    workspace_id: UUID
    correlation_id: UUID
    idempotency_key: str
