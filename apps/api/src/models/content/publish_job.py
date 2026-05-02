from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.content._enums import PublishJobStatus, PublishJobType


class PublishJobRecord(BaseModel):
    """Domain model for release publish job tracking."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="publish_jobs",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="publish_jobs",
        on_delete=fields.CASCADE,
    )
    project_id = fields.UUIDField(null=True, db_index=True)
    release_id = fields.UUIDField(null=True, db_index=True)

    job_type = fields.CharEnumField(PublishJobType, max_length=32, db_index=True)
    status = fields.CharEnumField(
        PublishJobStatus,
        max_length=16,
        default=PublishJobStatus.PENDING,
        db_index=True,
    )
    scheduled_at = fields.DatetimeField(null=True, db_index=True)
    started_at = fields.DatetimeField(null=True, db_index=True)
    completed_at = fields.DatetimeField(null=True, db_index=True)
    error_message = fields.TextField(null=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_publish_jobs"
        abstract = False
        indexes = (("status", "scheduled_at"), ("site_id", "created_at"))
