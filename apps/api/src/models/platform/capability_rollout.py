from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class WorkspaceCapabilityRolloutStage(StrEnum):
    NOT_AVAILABLE = "not_available"
    SELECTED_WORKSPACES = "selected_workspaces"
    ALL_ELIGIBLE = "all_eligible"


class WorkspaceCapabilityRollout(BaseModel):
    """Canonical adoption policy for one Workspace-facing Platform capability."""

    capability_id = fields.CharField(max_length=128, unique=True)
    stage = fields.CharEnumField(WorkspaceCapabilityRolloutStage, default=WorkspaceCapabilityRolloutStage.NOT_AVAILABLE)
    revision = fields.BigIntField(default=0)
    selection_revision = fields.BigIntField(default=0)

    class Meta(BaseModel.Meta):
        table = "platform_workspace_capability_rollouts"
        table_description = "Revisioned Workspace capability adoption policies."
        abstract = False


class WorkspaceCapabilityRolloutSelection(BaseModel):
    """Stable Workspace identity explicitly selected by one rollout policy."""

    rollout = fields.ForeignKeyField(
        "models.WorkspaceCapabilityRollout",
        related_name="selected_workspaces",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)

    if TYPE_CHECKING:
        rollout_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_workspace_capability_rollout_selections"
        table_description = "Stable selected Workspace scope for capability rollouts."
        abstract = False
        unique_together = (("rollout_id", "workspace_id"),)
        indexes = (("workspace_id", "rollout_id"),)


class WorkspaceCapabilityRolloutPreview(BaseModel):
    """Immutable server-generated review record for one proposed rollout revision."""

    capability_id = fields.CharField(max_length=128, db_index=True)
    source_revision = fields.BigIntField()
    source_selection_revision = fields.BigIntField()
    capability_revision = fields.BigIntField()
    eligibility_revision = fields.BigIntField()
    eligibility_snapshot_hash = fields.CharField(max_length=64)
    proposed_stage = fields.CharEnumField(WorkspaceCapabilityRolloutStage)
    proposed_workspace_ids = fields.JSONField(default=list)
    snapshot = fields.JSONField()
    expires_at = fields.DatetimeField(db_index=True)
    applied_actor_user_id = fields.UUIDField(null=True)
    applied_idempotency_key = fields.CharField(max_length=128, null=True)
    applied_rollout_revision = fields.BigIntField(null=True)
    applied_selection_revision = fields.BigIntField(null=True)
    applied_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "platform_workspace_capability_rollout_previews"
        table_description = "Immutable review snapshots for Workspace capability rollout applies."
        abstract = False
        indexes = (("capability_id", "created_at"), ("capability_id", "source_revision"))
