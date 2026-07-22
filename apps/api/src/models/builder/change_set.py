from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.indexes import Index

from src.common.models.base import BaseModel
from src.models.builder._enums import (
    BuilderApprovalClass,
    BuilderApprovalStatus,
    BuilderChangeSetCommandKind,
    BuilderChangeSetStatus,
    BuilderProvenanceSource,
)


class BuilderChangeSetRecord(BaseModel):
    """Persisted typed Builder proposal; preview never mutates target domains."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(db_index=True)
    base_site_revision_id = fields.UUIDField(db_index=True)
    base_manifest_hash = fields.CharField(max_length=71, db_index=True)
    status = fields.CharEnumField(
        BuilderChangeSetStatus,
        max_length=16,
        default=BuilderChangeSetStatus.PREVIEWED,
        db_default=BuilderChangeSetStatus.PREVIEWED,
        db_index=True,
    )
    operations = fields.JSONField()
    operations_hash = fields.CharField(max_length=71, db_index=True)
    affected_targets = fields.JSONField(default=list)
    issues = fields.JSONField(default=list)
    required_permissions = fields.JSONField(default=list)
    approval_class = fields.CharEnumField(BuilderApprovalClass, max_length=16, db_index=True)
    preview_token_hash = fields.CharField(max_length=71, unique=True, db_index=True)
    expires_at = fields.DatetimeField(db_index=True)
    provenance_source = fields.CharEnumField(BuilderProvenanceSource, max_length=16)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    agent_run_id = fields.UUIDField(null=True, db_index=True)
    agent_id = fields.UUIDField(null=True, db_index=True)
    agent_version_id = fields.UUIDField(null=True, db_index=True)
    agent_assignment_id = fields.UUIDField(null=True, db_index=True)
    tool_name = fields.CharField(max_length=128, null=True)
    correlation_id = fields.CharField(max_length=128, null=True, db_index=True)
    applied_site_revision_id = fields.UUIDField(null=True, db_index=True)
    apply_result = fields.JSONField(null=True)
    applied_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "builder_change_sets"
        table_description = "Typed Builder proposals with signed-preview and apply lifecycle state."
        abstract = False
        indexes = (
            Index(fields=("project_id", "site_id", "environment_id", "created_at")),
            Index(fields=("base_site_revision_id", "status", "created_at")),
        )

    if TYPE_CHECKING:
        id: UUID


class BuilderChangeSetCommandRecord(BaseModel):
    """Exact idempotency snapshot for Builder ChangeSet preview/apply commands."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    change_set_id = fields.UUIDField(null=True, db_index=True)
    command_kind = fields.CharEnumField(BuilderChangeSetCommandKind, max_length=16, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    result_snapshot = fields.JSONField()
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "builder_change_set_commands"
        table_description = "Idempotent Builder ChangeSet preview and apply command results."
        abstract = False
        unique_together = (("project_id", "command_kind", "request_idempotency_key"),)

    if TYPE_CHECKING:
        id: UUID


class BuilderChangeSetApprovalRecord(BaseModel):
    """Explicit human checkpoint bound to one immutable ChangeSet preview."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    change_set = fields.OneToOneField(
        "models.BuilderChangeSetRecord",
        source_field="change_set_id",
        related_name="approval_checkpoint",
        on_delete=fields.CASCADE,
    )
    approval_class = fields.CharEnumField(BuilderApprovalClass, max_length=16, db_index=True)
    operations_hash = fields.CharField(max_length=71, db_index=True)
    status = fields.CharEnumField(
        BuilderApprovalStatus,
        max_length=16,
        default=BuilderApprovalStatus.PENDING,
        db_default=BuilderApprovalStatus.PENDING,
        db_index=True,
    )
    requested_by_user_id = fields.UUIDField(db_index=True)
    approved_by_user_id = fields.UUIDField(null=True, db_index=True)
    expires_at = fields.DatetimeField(db_index=True)
    approved_at = fields.DatetimeField(null=True, db_index=True)
    consumed_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "builder_change_set_approvals"
        table_description = "Human approval checkpoints bound to typed Builder ChangeSets."
        abstract = False
        indexes = (
            Index(fields=("project_id", "status", "expires_at")),
            Index(fields=("workspace_id", "requested_by_user_id", "status")),
        )

    if TYPE_CHECKING:
        id: UUID
        change_set_id: UUID
