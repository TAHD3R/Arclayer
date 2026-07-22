from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.skills._enums import SkillGitHubImportOperation, SkillGitHubImportStatus


class SkillGitHubImportRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="skill_github_imports",
        on_delete=fields.CASCADE,
    )
    package_id = fields.UUIDField(null=True, db_index=True)
    version_id = fields.UUIDField(null=True, db_index=True)
    operation = fields.CharEnumField(SkillGitHubImportOperation, max_length=16, db_index=True)
    status = fields.CharEnumField(
        SkillGitHubImportStatus,
        max_length=16,
        default=SkillGitHubImportStatus.QUEUED,
        db_index=True,
    )
    repository_url = fields.CharField(max_length=2048)
    requested_ref = fields.CharField(max_length=256)
    subpath = fields.CharField(max_length=512)
    request_revision = fields.CharField(max_length=71)
    resolved_commit = fields.CharField(max_length=64, null=True)
    resolved_tree = fields.CharField(max_length=64, null=True)
    job_id = fields.UUIDField(null=True, db_index=True)
    safe_error_code = fields.CharField(max_length=128, null=True)
    safe_error_message = fields.CharField(max_length=1000, null=True)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "skill_github_imports"
        table_description = "Durable workspace GitHub Skill import and refresh state."
        abstract = False
        unique_together = (("workspace_id", "request_idempotency_key"),)
        indexes = (
            ("workspace_id", "status", "created_at"),
            ("workspace_id", "package_id", "created_at"),
        )
