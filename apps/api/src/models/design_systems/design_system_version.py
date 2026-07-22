from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.design_systems._enums import (
    DesignSystemValidationStatus,
    DesignSystemVersionSource,
    DesignSystemVersionStatus,
)


class DesignSystemVersionRecord(BaseModel):
    design_system = fields.ForeignKeyField(
        "models.DesignSystemRecord",
        related_name="versions",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    version_number = fields.IntField()
    manifest_version = fields.IntField(default=1)
    manifest = fields.JSONField()
    manifest_checksum = fields.CharField(max_length=71, db_index=True)
    token_index_hash = fields.CharField(max_length=71)
    component_catalog_version = fields.CharField(max_length=128, null=True)
    schema_version = fields.IntField(default=1)
    parent_version_id = fields.UUIDField(null=True, db_index=True)
    source = fields.CharEnumField(
        DesignSystemVersionSource,
        max_length=16,
        default=DesignSystemVersionSource.MANUAL,
        db_index=True,
    )
    provenance = fields.JSONField(default=dict)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        design_system_id: UUID
        lifecycle_state: DesignSystemVersionStateRecord

    class Meta(BaseModel.Meta):
        table = "design_system_versions"
        table_description = "Immutable Workspace Design System manifests."
        abstract = False
        unique_together = (
            ("design_system_id", "version_number"),
            ("design_system_id", "request_idempotency_key"),
        )
        indexes = (("workspace_id", "design_system_id", "created_at"),)


class DesignSystemVersionStateRecord(BaseModel):
    design_system_version = fields.OneToOneField(
        "models.DesignSystemVersionRecord",
        related_name="lifecycle_state",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    status = fields.CharEnumField(
        DesignSystemVersionStatus,
        max_length=16,
        default=DesignSystemVersionStatus.CANDIDATE,
        db_index=True,
    )
    status_revision = fields.IntField(default=1)
    superseded_by_version_id = fields.UUIDField(null=True, db_index=True)
    status_changed_at = fields.DatetimeField()
    status_changed_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        design_system_version_id: UUID

    class Meta(BaseModel.Meta):
        table = "design_system_version_states"
        table_description = "Mutable lifecycle state for immutable Design System versions."
        abstract = False
        indexes = (("workspace_id", "status", "updated_at"),)


class DesignSystemValidationResultRecord(BaseModel):
    design_system_version = fields.ForeignKeyField(
        "models.DesignSystemVersionRecord",
        related_name="validation_results",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    profile = fields.CharField(max_length=32, default="foundation", db_index=True)
    validator_version = fields.IntField(default=1)
    status = fields.CharEnumField(DesignSystemValidationStatus, max_length=16, db_index=True)
    findings = fields.JSONField(default=list)
    finding_hash = fields.CharField(max_length=71)
    token_index_hash = fields.CharField(max_length=71)
    publish_ready = fields.BooleanField(default=False)
    compatibility = fields.JSONField(default=dict)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        design_system_version_id: UUID

    class Meta(BaseModel.Meta):
        table = "design_system_validation_results"
        table_description = "Immutable Design System validation evidence."
        abstract = False
        unique_together = (("design_system_version_id", "request_idempotency_key"),)
        indexes = (("workspace_id", "profile", "status", "created_at"),)
