from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.skills._enums import (
    SkillResourceRole,
    SkillValidationStatus,
    SkillVersionStatus,
)


class SkillVersionRecord(BaseModel):
    package = fields.ForeignKeyField(
        "models.SkillPackageRecord",
        related_name="versions",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(null=True, db_index=True)
    version_number = fields.IntField()
    semantic_version = fields.CharField(max_length=64, null=True)
    manifest_version = fields.IntField(default=1)
    manifest = fields.JSONField()
    package_checksum = fields.CharField(max_length=71, db_index=True)
    source_provenance = fields.JSONField(default=dict)
    compatibility = fields.JSONField(default=dict)
    required_tools = fields.JSONField(default=list)
    permissions = fields.JSONField(default=list)
    data_egress = fields.JSONField(default=list)
    capability_tags = fields.JSONField(default=list)
    validation_policy_version = fields.IntField(default=1)
    status = fields.CharEnumField(
        SkillVersionStatus,
        max_length=16,
        default=SkillVersionStatus.CANDIDATE,
        db_index=True,
    )
    provenance_actor_user_id = fields.UUIDField(null=True, db_index=True)
    provenance_job_id = fields.UUIDField(null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        package_id: UUID

    class Meta(BaseModel.Meta):
        table = "skill_versions"
        table_description = "Immutable Skill manifests and provenance."
        abstract = False
        unique_together = (
            ("package_id", "version_number"),
            ("package_id", "request_idempotency_key"),
        )
        indexes = (("workspace_id", "package_id", "created_at"),)


class SkillResourceRecord(BaseModel):
    skill_version = fields.ForeignKeyField(
        "models.SkillVersionRecord",
        related_name="resources",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(null=True, db_index=True)
    normalized_path = fields.CharField(max_length=512)
    role = fields.CharEnumField(SkillResourceRole, max_length=16, db_index=True)
    mime_type = fields.CharField(max_length=128)
    byte_size = fields.IntField()
    content_digest = fields.CharField(max_length=71, db_index=True)
    inline_content = fields.TextField(null=True)
    asset_id = fields.UUIDField(null=True, db_index=True)
    storage_reference = fields.JSONField(default=dict)

    if TYPE_CHECKING:
        skill_version_id: UUID

    class Meta(BaseModel.Meta):
        table = "skill_resources"
        table_description = "Immutable Skill version resources."
        abstract = False
        unique_together = (("skill_version_id", "normalized_path"),)
        indexes = (("workspace_id", "skill_version_id", "role"),)


class SkillValidationResultRecord(BaseModel):
    skill_version = fields.ForeignKeyField(
        "models.SkillVersionRecord",
        related_name="validation_results",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(null=True, db_index=True)
    validator_policy_version = fields.IntField()
    status = fields.CharEnumField(SkillValidationStatus, max_length=16, db_index=True)
    findings = fields.JSONField(default=list)
    finding_hash = fields.CharField(max_length=71)
    validator_job_id = fields.UUIDField(null=True, db_index=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    correlation_id = fields.CharField(max_length=128, null=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        skill_version_id: UUID

    class Meta(BaseModel.Meta):
        table = "skill_validation_results"
        table_description = "Immutable Skill validation evidence."
        abstract = False
        unique_together = (("skill_version_id", "request_idempotency_key"),)
        indexes = (("workspace_id", "status", "created_at"),)
