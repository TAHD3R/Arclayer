from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.skills._enums import (
    SkillInstallationStatus,
    SkillPackageScope,
    SkillUpdateRisk,
)


class SkillInstallationRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="skill_installations",
        on_delete=fields.CASCADE,
    )
    package_scope = fields.CharEnumField(SkillPackageScope, max_length=16)
    package_id = fields.UUIDField(db_index=True)
    version_id = fields.UUIDField(db_index=True)
    package_checksum = fields.CharField(max_length=71)
    status = fields.CharEnumField(
        SkillInstallationStatus,
        max_length=16,
        default=SkillInstallationStatus.ENABLED,
        db_index=True,
    )
    safe_reason_code = fields.CharField(max_length=128, null=True)
    accepted_required_tools = fields.JSONField(default=list)
    accepted_permissions = fields.JSONField(default=list)
    accepted_data_egress = fields.JSONField(default=list)
    validation_finding_hash = fields.CharField(max_length=71)
    available_update_version_id = fields.UUIDField(null=True, db_index=True)
    update_risk = fields.CharEnumField(
        SkillUpdateRisk,
        max_length=16,
        default=SkillUpdateRisk.NONE,
    )
    update_risk_summary = fields.JSONField(default=dict)
    metadata_revision = fields.IntField(default=1)
    installed_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "skill_installations"
        table_description = "Workspace pins to exact validated Skill versions."
        abstract = False
        unique_together = (
            ("workspace_id", "package_scope", "package_id"),
            ("workspace_id", "request_idempotency_key"),
        )
        indexes = (("workspace_id", "status", "updated_at"),)
