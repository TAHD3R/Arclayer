from __future__ import annotations

from tortoise import fields
from tortoise.signals import post_save

from src.common.models.base import BaseModel


class ProjectRecord(BaseModel):
    """Domain model for project records."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="projects",
        on_delete=fields.CASCADE,
    )

    slug = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.CharField(max_length=256, null=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "domain_projects"
        abstract = False
        unique_together = (("workspace_id", "slug"),)


@post_save(ProjectRecord)
async def _bootstrap_primary_runtime(  # type: ignore[no-untyped-def]
    sender,
    instance: ProjectRecord,
    created: bool,
    using_db,
    update_fields,
) -> None:
    """Ensure each project has a primary runtime."""

    if not created:
        return

    from src.models.projects.runtime import ProjectRuntimeKind, ProjectRuntimeRecord

    existing = (
        await ProjectRuntimeRecord
        .filter(project_id=instance.id, kind=ProjectRuntimeKind.PRIMARY)
        .using_db(using_db)
        .exists()
    )
    if existing:
        return

    await ProjectRuntimeRecord.create(
        using_db=using_db,
        project_id=instance.id,
        kind=ProjectRuntimeKind.PRIMARY,
        name="Primary",
        is_active=True,
    )
