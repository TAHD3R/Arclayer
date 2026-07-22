from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.skills._enums import SkillPackageScope, SkillUpdateRisk


class SkillUpdatePreviewRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="skill_update_previews",
        on_delete=fields.CASCADE,
    )
    installation = fields.ForeignKeyField(
        "models.SkillInstallationRecord",
        related_name="update_previews",
        on_delete=fields.CASCADE,
    )
    expected_installation_revision = fields.IntField()
    current_version_id = fields.UUIDField(db_index=True)
    current_package_checksum = fields.CharField(max_length=71)
    current_validation_finding_hash = fields.CharField(max_length=71)
    candidate_version_id = fields.UUIDField(db_index=True)
    candidate_package_checksum = fields.CharField(max_length=71)
    candidate_validation_finding_hash = fields.CharField(max_length=71)
    current_target = fields.JSONField()
    candidate_target = fields.JSONField()
    risk = fields.CharEnumField(SkillUpdateRisk, max_length=16, db_index=True)
    risk_categories = fields.JSONField(default=list)
    diff = fields.JSONField()
    preview_hash = fields.CharField(max_length=71, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    acceptance_idempotency_key = fields.CharField(max_length=128, null=True)
    acceptance_fingerprint = fields.CharField(max_length=64, null=True)
    accepted_by_user_id = fields.UUIDField(null=True, db_index=True)
    accepted_at = fields.DatetimeField(null=True, db_index=True)
    resulting_installation_revision = fields.IntField(null=True)
    resulting_version_id = fields.UUIDField(null=True, db_index=True)
    result_snapshot = fields.JSONField(null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        installation_id: UUID

    class Meta(BaseModel.Meta):
        table = "skill_update_previews"
        table_description = "Persisted exact-version Skill update reviews and idempotent acceptance outcomes."
        abstract = False
        unique_together = (
            ("workspace_id", "request_idempotency_key"),
            ("workspace_id", "acceptance_idempotency_key"),
        )
        indexes = (
            ("workspace_id", "installation_id", "created_at"),
            ("workspace_id", "candidate_version_id", "created_at"),
        )


class SkillInstallationRemovalRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="skill_installation_removals",
        on_delete=fields.CASCADE,
    )
    installation_id = fields.UUIDField(db_index=True)
    package_scope = fields.CharEnumField(SkillPackageScope, max_length=16)
    package_id = fields.UUIDField(db_index=True)
    version_id = fields.UUIDField(db_index=True)
    expected_installation_revision = fields.IntField()
    impact = fields.JSONField()
    removed_by_user_id = fields.UUIDField(null=True, db_index=True)
    removed_at = fields.DatetimeField(db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    result_snapshot = fields.JSONField()

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "skill_installation_removals"
        table_description = "Idempotent, audited Workspace Skill uninstall outcomes."
        abstract = False
        unique_together = (
            ("workspace_id", "installation_id"),
            ("workspace_id", "request_idempotency_key"),
        )
        indexes = (("workspace_id", "removed_at", "id"),)


class SkillPackageArchiveRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="skill_package_archives",
        on_delete=fields.CASCADE,
    )
    package_id = fields.UUIDField(db_index=True)
    expected_package_revision = fields.IntField()
    impact = fields.JSONField()
    archived_by_user_id = fields.UUIDField(null=True, db_index=True)
    archived_at = fields.DatetimeField(db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    result_snapshot = fields.JSONField()

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "skill_package_archives"
        table_description = "Idempotent, audited Workspace Skill package archive outcomes."
        abstract = False
        unique_together = (
            ("workspace_id", "package_id"),
            ("workspace_id", "request_idempotency_key"),
        )
        indexes = (("workspace_id", "archived_at", "id"),)
