from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class ProjectRuntimeKind(StrEnum):
    """Project runtime kind."""

    PRIMARY = "primary"


class ProjectRuntimeRecord(BaseModel):
    """Domain model for project runtime records."""

    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="runtimes",
        on_delete=fields.CASCADE,
    )

    kind = fields.CharEnumField(ProjectRuntimeKind, default=ProjectRuntimeKind.PRIMARY, db_index=True)
    name = fields.CharField(max_length=64, default="Primary")
    is_active = fields.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "domain_project_runtimes"
        abstract = False
        unique_together = (("project_id", "kind"),)
