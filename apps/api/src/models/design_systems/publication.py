from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.design_systems._enums import DesignSystemArtifactStatus, DesignSystemPublicationStatus


class DesignSystemPublicationRecord(BaseModel):
    """Canonical asynchronous publication operation for one immutable version."""

    design_system_version = fields.OneToOneField(
        "models.DesignSystemVersionRecord",
        related_name="publication_record",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    design_system_id = fields.UUIDField(db_index=True)
    manifest_checksum = fields.CharField(max_length=71, db_index=True)
    validation_finding_hash = fields.CharField(max_length=71)
    validator_version = fields.IntField()
    status = fields.CharEnumField(
        DesignSystemPublicationStatus,
        max_length=16,
        default=DesignSystemPublicationStatus.PENDING,
        db_index=True,
    )
    job_id = fields.UUIDField(unique=True, db_index=True)
    component_catalog_version = fields.CharField(max_length=128, null=True)
    compiler_version = fields.CharField(max_length=64)
    renderer_profile = fields.CharField(max_length=64)
    renderer_version = fields.CharField(max_length=32)
    asset_pins = fields.JSONField(default=list)
    asset_pins_hash = fields.CharField(max_length=71)
    actor_user_id = fields.UUIDField(db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    failure_code = fields.CharField(max_length=96, null=True)
    failure_message = fields.CharField(max_length=4000, null=True)
    published_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        design_system_version_id: UUID

    class Meta(BaseModel.Meta):
        table = "design_system_publications"
        table_description = "Canonical durable publication operations for immutable Design System versions."
        abstract = False
        indexes = (
            ("workspace_id", "design_system_id", "status", "created_at"),
            ("workspace_id", "job_id"),
        )


class DesignSystemArtifactRecord(BaseModel):
    """Content-addressed deterministic compiler output bound to one publication."""

    publication = fields.OneToOneField(
        "models.DesignSystemPublicationRecord",
        related_name="artifact",
        on_delete=fields.CASCADE,
    )
    design_system_version = fields.ForeignKeyField(
        "models.DesignSystemVersionRecord",
        related_name="artifacts",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    design_system_id = fields.UUIDField(db_index=True)
    manifest_checksum = fields.CharField(max_length=71, db_index=True)
    validation_finding_hash = fields.CharField(max_length=71)
    validator_version = fields.IntField()
    artifact_input_hash = fields.CharField(max_length=71, db_index=True)
    artifact_hash = fields.CharField(max_length=71, null=True, db_index=True)
    status = fields.CharEnumField(
        DesignSystemArtifactStatus,
        max_length=16,
        default=DesignSystemArtifactStatus.PENDING,
        db_index=True,
    )
    compiler_version = fields.CharField(max_length=64)
    renderer_profile = fields.CharField(max_length=64)
    renderer_version = fields.CharField(max_length=32)
    component_catalog_version = fields.CharField(max_length=128, null=True)
    asset_pins = fields.JSONField(default=list)
    artifact_payload = fields.JSONField(null=True)
    smoke_evidence = fields.JSONField(null=True)
    failure_code = fields.CharField(max_length=96, null=True)
    failure_message = fields.CharField(max_length=4000, null=True)
    built_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        publication_id: UUID
        design_system_version_id: UUID

    class Meta(BaseModel.Meta):
        table = "design_system_artifacts"
        table_description = "Content-addressed deterministic Design System compiler artifacts."
        abstract = False
        unique_together = (("design_system_version_id", "artifact_input_hash"),)
        indexes = (
            ("workspace_id", "design_system_id", "status", "created_at"),
            ("artifact_input_hash", "status"),
        )
