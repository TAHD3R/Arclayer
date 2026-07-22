from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.signals import post_save

from src.common.models.base import BaseModel
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.models.workspaces.workspace import WorkspaceIconMode


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
    icon_mode = fields.CharEnumField(
        WorkspaceIconMode,
        default=WorkspaceIconMode.INITIALS,
        db_default=WorkspaceIconMode.INITIALS,
    )
    icon_color = fields.CharField(max_length=16, default="#337ea9", db_default="#337ea9")
    icon_glyph = fields.CharField(max_length=64, null=True)
    icon_emoji = fields.CharField(max_length=32, null=True)
    icon_url = fields.CharField(max_length=1024, null=True)
    authoring_mode = fields.CharEnumField(
        ProjectAuthoringMode,
        max_length=32,
        null=True,
        db_index=True,
    )
    authoring_state = fields.CharEnumField(
        ProjectAuthoringState,
        max_length=32,
        default=ProjectAuthoringState.MIGRATION_REQUIRED,
        db_default=ProjectAuthoringState.MIGRATION_REQUIRED,
        db_index=True,
    )
    authoring_revision = fields.IntField(default=1, db_default=1)
    authoring_resolved_by_user_id = fields.UUIDField(null=True, db_index=True)
    authoring_resolved_at = fields.DatetimeField(null=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "projects"
        table_description = "Project records within workspaces."
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

    from src.models.projects.environment import bootstrap_project_environments
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
    await bootstrap_project_environments(
        project_id=instance.id,
        actor_user_id=instance.created_by_user_id,
        using_db=using_db,
    )
