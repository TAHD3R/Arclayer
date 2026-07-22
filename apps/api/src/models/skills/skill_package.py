from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.skills._enums import (
    SkillPackageScope,
    SkillPackageStatus,
    SkillSourceKind,
    SkillTrustLevel,
)


class SkillPackageRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="skill_packages",
        on_delete=fields.CASCADE,
        null=True,
    )
    stable_key = fields.CharField(max_length=256, unique=True)
    scope = fields.CharEnumField(SkillPackageScope, max_length=16, db_index=True)
    source_kind = fields.CharEnumField(SkillSourceKind, max_length=16, db_index=True)
    slug = fields.CharField(max_length=96)
    normalized_slug = fields.CharField(max_length=96, db_index=True)
    display_name = fields.CharField(max_length=128)
    description = fields.CharField(max_length=1000)
    publisher_id = fields.CharField(max_length=192)
    publisher_name = fields.CharField(max_length=128)
    trust_level = fields.CharEnumField(SkillTrustLevel, max_length=32, db_index=True)
    publisher_verification = fields.JSONField(default=dict)
    status = fields.CharEnumField(
        SkillPackageStatus,
        max_length=16,
        default=SkillPackageStatus.ACTIVE,
        db_index=True,
    )
    latest_valid_version_id = fields.UUIDField(null=True, db_index=True)
    metadata_revision = fields.IntField(default=1)
    source_descriptor = fields.JSONField(default=dict)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128, null=True)
    request_fingerprint = fields.CharField(max_length=64, null=True)
    archived_at = fields.DatetimeField(null=True, db_index=True)
    archived_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "skill_packages"
        table_description = "System or workspace Skill package identities."
        abstract = False
        unique_together = (
            ("workspace_id", "normalized_slug"),
            ("workspace_id", "request_idempotency_key"),
        )
        indexes = (
            ("scope", "status", "updated_at"),
            ("workspace_id", "status", "updated_at"),
        )
