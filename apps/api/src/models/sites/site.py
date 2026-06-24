from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


# Site (public portal boundary).
class SiteRecord(BaseModel):
    """Domain model for site records.

    Site (public portal boundary).

    Project runtime storage:
    - A site belongs to a workspace as tenant context.
    - A site can be attached to a project and runtime as the public delivery boundary.
    - Public routing resolves through project runtime ownership and verified domains.
    """

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="sites",
        on_delete=fields.CASCADE,
    )
    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="sites",
        on_delete=fields.CASCADE,
        null=True,
    )
    runtime = fields.ForeignKeyField(
        "models.ProjectRuntimeRecord",
        related_name="sites",
        on_delete=fields.CASCADE,
        null=True,
    )

    slug = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)

    default_locale = fields.CharField(max_length=16, default="zh-CN")
    fallback_locale = fields.CharField(max_length=16, default="en-US")

    is_active = fields.BooleanField(default=True, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "sites"
        table_description = "Published site records bound to runtimes."
        abstract = False
        unique_together = (("runtime_id",),)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID | None
        runtime_id: UUID | None
