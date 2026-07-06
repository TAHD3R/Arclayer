from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class ProjectSourceFileRecord(BaseModel):
    """Managed project source file overlay."""

    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="source_files",
        on_delete=fields.CASCADE,
    )
    path = fields.CharField(max_length=1024, db_index=True)
    role = fields.CharField(max_length=32)
    language = fields.CharField(max_length=64)
    contents = fields.TextField()
    is_deleted = fields.BooleanField(default=False, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        project_id: UUID

    class Meta(BaseModel.Meta):
        table = "project_source_files"
        table_description = "Managed source file overlay records for project source trees."
        abstract = False
        unique_together = (("project_id", "path"),)
