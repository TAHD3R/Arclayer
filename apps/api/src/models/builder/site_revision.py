from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.indexes import Index

from src.common.models.base import BaseModel
from src.models.builder._enums import BuilderProvenanceSource, SiteRevisionLifecycleStatus
from src.models.projects._enums import ProjectAuthoringMode


class SiteRevisionManifestRecord(BaseModel):
    """Immutable input-only manifest for one Builder revision."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(db_index=True)
    revision_number = fields.IntField()
    base_revision_id = fields.UUIDField(null=True, db_index=True)
    manifest_version = fields.IntField(default=1)
    authoring_mode = fields.CharEnumField(ProjectAuthoringMode, max_length=32)
    content_structure_revision_id = fields.UUIDField(db_index=True)
    content_structure_hash = fields.CharField(max_length=71, db_index=True)
    design_system_id = fields.UUIDField(db_index=True)
    design_system_version_id = fields.UUIDField(db_index=True)
    design_system_manifest_checksum = fields.CharField(max_length=71, db_index=True)
    page_version_pins = fields.JSONField()
    global_section_version_pins = fields.JSONField(default=list)
    presentation_set_hash = fields.CharField(max_length=71, db_index=True)
    manifest_hash = fields.CharField(max_length=71, unique=True, db_index=True)
    manifest_snapshot = fields.JSONField()
    provenance_source = fields.CharEnumField(BuilderProvenanceSource, max_length=16)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    agent_run_id = fields.UUIDField(null=True, db_index=True)
    agent_id = fields.UUIDField(null=True, db_index=True)
    agent_version_id = fields.UUIDField(null=True, db_index=True)
    agent_assignment_id = fields.UUIDField(null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "site_revision_manifests"
        table_description = "Immutable Builder input manifests without lifecycle or artifact state."
        abstract = False
        unique_together = (("project_id", "site_id", "environment_id", "revision_number"),)
        indexes = (
            Index(fields=("project_id", "site_id", "environment_id", "created_at")),
            Index(fields=("design_system_version_id", "created_at")),
        )

    if TYPE_CHECKING:
        id: UUID


class SiteRevisionStatusRecord(BaseModel):
    """Mutable readiness and review projection outside the manifest hash."""

    site_revision = fields.OneToOneField(
        "models.SiteRevisionManifestRecord",
        source_field="site_revision_id",
        related_name="status_projection",
        on_delete=fields.CASCADE,
    )
    status = fields.CharEnumField(
        SiteRevisionLifecycleStatus,
        max_length=16,
        default=SiteRevisionLifecycleStatus.DRAFT,
        db_index=True,
    )
    status_revision = fields.IntField(default=1)
    readiness_findings = fields.JSONField(default=list)
    validator_version = fields.CharField(max_length=64)
    etag = fields.CharField(max_length=71, unique=True, db_index=True)
    calculated_at = fields.DatetimeField(db_index=True)

    class Meta(BaseModel.Meta):
        table = "site_revision_statuses"
        table_description = "Concurrency-controlled Builder readiness and review projections."
        abstract = False

    if TYPE_CHECKING:
        site_revision_id: UUID


class BuilderInitializationCommandRecord(BaseModel):
    """Exact idempotent result snapshot for root Builder revision creation."""

    workspace_id = fields.UUIDField(db_index=True)
    project_id = fields.UUIDField(db_index=True)
    site_id = fields.UUIDField(db_index=True)
    environment_id = fields.UUIDField(db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    result_snapshot = fields.JSONField()
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "builder_initialization_commands"
        table_description = "Idempotent command snapshots for Builder baseline initialization."
        abstract = False
        unique_together = (("project_id", "request_idempotency_key"),)
