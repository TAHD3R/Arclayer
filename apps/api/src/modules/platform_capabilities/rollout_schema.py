from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.models.platform.capability_rollout import WorkspaceCapabilityRolloutStage


class WorkspaceCapabilityEligibility(BaseSchema):
    """Owning-domain eligibility result; rollout never evaluates other capability gates."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    workspace_id: UUID
    is_eligible: bool
    ineligibility_reasons: tuple[str, ...] = ()

    @model_validator(mode="after")
    def _validate_reason_shape(self) -> WorkspaceCapabilityEligibility:
        if self.is_eligible and self.ineligibility_reasons:
            raise ValueError("eligible Workspace cannot have ineligibility reasons")
        if not self.is_eligible and not self.ineligibility_reasons:
            raise ValueError("ineligible Workspace requires stable reasons")
        return self


class WorkspaceCapabilityOperationalConsequence(BaseSchema):
    """Owning-domain localized consequence input; rollout never invents domain copy."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    code: str = Field(min_length=1, max_length=128)
    params: dict[str, str | int | bool] = Field(default_factory=dict)


class WorkspaceCapabilityEligibilitySnapshot(BaseSchema):
    """Revisioned owning-domain eligibility input captured for a rollout preview."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    capability_revision: int = Field(ge=0)
    eligibility_revision: int = Field(ge=0)
    workspaces: tuple[WorkspaceCapabilityEligibility, ...]
    operational_consequences: tuple[WorkspaceCapabilityOperationalConsequence, ...] = ()

    @model_validator(mode="after")
    def _validate_workspace_identity_uniqueness(self) -> WorkspaceCapabilityEligibilitySnapshot:
        workspace_ids = tuple(item.workspace_id for item in self.workspaces)
        if len(workspace_ids) != len(set(workspace_ids)):
            raise ValueError("Workspace eligibility entries must be unique")
        return self


class WorkspaceCapabilityEligibilityDecision(BaseSchema):
    """Targeted runtime eligibility response; no full Workspace inventory is required."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    capability_revision: int = Field(ge=0)
    eligibility_revision: int = Field(ge=0)
    workspace: WorkspaceCapabilityEligibility


class WorkspaceCapabilityRolloutPolicy(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True, use_enum_values=False)

    capability_id: str
    stage: WorkspaceCapabilityRolloutStage
    revision: int = Field(ge=0)
    selection_revision: int = Field(ge=0)
    selected_workspace_ids: tuple[UUID, ...]


class WorkspaceCapabilityRolloutPreviewRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True, use_enum_values=False)

    proposed_stage: WorkspaceCapabilityRolloutStage
    selected_workspace_ids: tuple[UUID, ...] = ()

    @model_validator(mode="after")
    def _validate_selected_scope(self) -> WorkspaceCapabilityRolloutPreviewRequest:
        if len(self.selected_workspace_ids) != len(set(self.selected_workspace_ids)):
            raise ValueError("selected Workspace identities must be unique")
        if self.proposed_stage != WorkspaceCapabilityRolloutStage.SELECTED_WORKSPACES and self.selected_workspace_ids:
            raise ValueError("only selected_workspaces may contain selected Workspace identities")
        return self


class WorkspaceCapabilityRolloutWorkspaceImpact(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    workspace_id: UUID
    selected: bool
    is_eligible: bool
    ineligibility_reasons: tuple[str, ...]
    currently_available: bool
    proposed_available: bool


class WorkspaceCapabilityRolloutImpactSummary(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    affected_workspace_count: int = Field(ge=0)
    eligible_workspace_count: int = Field(ge=0)
    ineligible_workspace_count: int = Field(ge=0)
    selected_workspace_count: int = Field(ge=0)
    newly_available_workspace_ids: tuple[UUID, ...]
    no_longer_available_workspace_ids: tuple[UUID, ...]
    blocked_workspace_count: int = Field(ge=0)


class WorkspaceCapabilityRolloutPreview(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True, use_enum_values=False)

    id: UUID
    capability_id: str
    source_policy: WorkspaceCapabilityRolloutPolicy
    proposed_stage: WorkspaceCapabilityRolloutStage
    proposed_selected_workspace_ids: tuple[UUID, ...]
    capability_revision: int = Field(ge=0)
    eligibility_revision: int = Field(ge=0)
    eligibility_snapshot_hash: str
    operational_consequences: tuple[WorkspaceCapabilityOperationalConsequence, ...]
    workspaces: tuple[WorkspaceCapabilityRolloutWorkspaceImpact, ...]
    summary: WorkspaceCapabilityRolloutImpactSummary
    created_at: datetime | None = None
    expires_at: datetime
    applied_rollout_revision: int | None = Field(default=None, ge=1)


class WorkspaceCapabilityRolloutApplyRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    preview_id: UUID
    idempotency_key: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=512)


class WorkspaceCapabilityRolloutApplyReceipt(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    capability_id: str
    rollout_revision: int = Field(ge=1)
    selection_revision: int = Field(ge=0)
    applied_at: datetime
    replayed: bool = False


class WorkspaceCapabilityRolloutEnforcement(BaseSchema):
    """Read-side contract for Product API, workers, and owning domains."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    capability_id: str
    workspace_id: UUID
    rollout_revision: int = Field(ge=0)
    is_available: bool
    denial_code: str | None = None
    ineligibility_reasons: tuple[str, ...] = ()


class WorkspaceCapabilityRolloutRuntimeSnapshot(BaseSchema):
    """One-statement read of a rollout policy and one Workspace's explicit selection."""

    model_config = BaseSchema.model_config | ConfigDict(frozen=True, use_enum_values=False)

    capability_id: str
    rollout_revision: int = Field(ge=0)
    stage: WorkspaceCapabilityRolloutStage
    is_selected: bool
