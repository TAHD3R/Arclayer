from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.design_systems._enums import DesignSystemOwnerKind, DesignSystemStatus


class DesignSystemRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="design_systems",
        on_delete=fields.CASCADE,
    )
    owner_kind = fields.CharEnumField(
        DesignSystemOwnerKind,
        max_length=16,
        default=DesignSystemOwnerKind.WORKSPACE,
        db_index=True,
    )
    owning_project_id = fields.UUIDField(null=True, db_index=True)
    forked_from_system_id = fields.UUIDField(null=True, db_index=True)
    forked_from_version_id = fields.UUIDField(null=True, db_index=True)
    forked_from_manifest_checksum = fields.CharField(max_length=71, null=True)
    name = fields.CharField(max_length=128)
    normalized_name = fields.CharField(max_length=128)
    description = fields.CharField(max_length=1000, null=True)
    status = fields.CharEnumField(
        DesignSystemStatus,
        max_length=16,
        default=DesignSystemStatus.ACTIVE,
        db_index=True,
    )
    linked_asset_collection_id = fields.UUIDField(null=True, db_index=True)
    latest_valid_version_id = fields.UUIDField(null=True, db_index=True)
    metadata_revision = fields.IntField(default=1)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "design_systems"
        table_description = "Workspace-owned Design System identities."
        abstract = False
        unique_together = (
            ("workspace_id", "normalized_name"),
            ("workspace_id", "request_idempotency_key"),
        )
        indexes = (("workspace_id", "status", "updated_at"),)


class WorkspaceDesignSystemDefaultRecord(BaseModel):
    workspace = fields.OneToOneField(
        "models.Workspace",
        related_name="design_system_default",
        on_delete=fields.CASCADE,
    )
    design_system_id = fields.UUIDField(db_index=True)
    design_system_version_id = fields.UUIDField(db_index=True)
    manifest_checksum = fields.CharField(max_length=71, db_index=True)
    validation_finding_hash = fields.CharField(max_length=71)
    metadata_revision = fields.IntField(default=1)
    assigned_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "workspace_design_system_defaults"
        table_description = "Exact Workspace Design System default assignments."
        abstract = False
        indexes = (("workspace_id", "design_system_id", "design_system_version_id"),)


class WorkspaceDesignSystemDefaultCommandRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="design_system_default_commands",
        on_delete=fields.CASCADE,
    )
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    result_snapshot = fields.JSONField()
    actor_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "workspace_design_system_default_commands"
        table_description = "Replay evidence for exact Workspace Design System default commands."
        abstract = False
        unique_together = (("workspace_id", "request_idempotency_key"),)


class ProjectDesignSystemAssignmentRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="project_design_system_assignments",
        on_delete=fields.CASCADE,
    )
    project_id = fields.UUIDField(unique=True)
    design_system_id = fields.UUIDField(db_index=True)
    design_system_version_id = fields.UUIDField(db_index=True)
    manifest_checksum = fields.CharField(max_length=71, db_index=True)
    validation_finding_hash = fields.CharField(max_length=71)
    metadata_revision = fields.IntField(default=1)
    assigned_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "project_design_system_assignments"
        table_description = "Exact Design System assignments for canonical Projects."
        abstract = False
        indexes = (("workspace_id", "design_system_id", "design_system_version_id"),)


class ProjectDesignSystemCommandRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="project_design_system_commands",
        on_delete=fields.CASCADE,
    )
    project_id = fields.UUIDField(db_index=True)
    command_kind = fields.CharField(max_length=32)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    result_snapshot = fields.JSONField()
    actor_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "project_design_system_commands"
        table_description = "Replay evidence for Project Design System authority commands."
        abstract = False
        unique_together = (("project_id", "request_idempotency_key"),)
