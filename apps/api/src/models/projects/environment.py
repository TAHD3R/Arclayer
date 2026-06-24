from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class ProjectEnvironmentKey(StrEnum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


PROJECT_ENVIRONMENT_SPECS: tuple[tuple[ProjectEnvironmentKey, str, bool, bool], ...] = (
    (ProjectEnvironmentKey.DEVELOPMENT, "Development", False, True),
    (ProjectEnvironmentKey.STAGING, "Staging", False, False),
    (ProjectEnvironmentKey.PRODUCTION, "Production", True, False),
)


class ProjectEnvironmentRecord(BaseModel):
    """Project deployment environment identity."""

    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="environments",
        on_delete=fields.CASCADE,
    )
    key = fields.CharEnumField(ProjectEnvironmentKey, db_index=True)
    name = fields.CharField(max_length=64)
    is_production = fields.BooleanField(default=False, db_index=True)
    is_default_preview = fields.BooleanField(default=False, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        project_id: UUID

    class Meta(BaseModel.Meta):
        table = "project_environments"
        table_description = "Project deployment environment identities."
        abstract = False
        unique_together = (("project_id", "key"),)


class ProjectEnvironmentAliasRecord(BaseModel):
    """Domain model for project environment alias records."""

    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="environment_aliases",
        on_delete=fields.CASCADE,
    )
    target_environment = fields.ForeignKeyField(
        "models.ProjectEnvironmentRecord",
        related_name="aliases",
        on_delete=fields.CASCADE,
    )
    key = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=64)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    switched_by_user_id = fields.UUIDField(null=True, db_index=True)
    switched_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        project_id: UUID
        target_environment_id: UUID

    class Meta(BaseModel.Meta):
        table = "project_environment_aliases"
        table_description = "Alias records for project deployment environments."
        abstract = False
        unique_together = (("project_id", "key"),)


async def bootstrap_project_environments(
    *,
    project_id: UUID,
    actor_user_id: UUID | None,
    using_db=None,
) -> None:
    existing_keys = {
        ProjectEnvironmentKey(str(value))
        for value in await ProjectEnvironmentRecord
        .filter(project_id=project_id)
        .using_db(using_db)
        .values_list("key", flat=True)
        if value is not None
    }
    rows = [
        ProjectEnvironmentRecord(
            project_id=project_id,
            key=key,
            name=name,
            is_production=is_production,
            is_default_preview=is_default_preview,
            created_by_user_id=actor_user_id,
        )
        for key, name, is_production, is_default_preview in PROJECT_ENVIRONMENT_SPECS
        if key not in existing_keys
    ]
    if rows:
        await ProjectEnvironmentRecord.bulk_create(rows, using_db=using_db)

    production = (
        await ProjectEnvironmentRecord
        .filter(project_id=project_id, key=ProjectEnvironmentKey.PRODUCTION)
        .using_db(using_db)
        .first()
    )
    if production is None:
        return

    existing_aliases = {
        str(value)
        for value in await ProjectEnvironmentAliasRecord
        .filter(project_id=project_id)
        .using_db(using_db)
        .values_list("key", flat=True)
        if value is not None
    }
    alias_rows = [
        ProjectEnvironmentAliasRecord(
            project_id=project_id,
            target_environment_id=production.id,
            key="master",
            name="Master",
            created_by_user_id=actor_user_id,
        )
        for key in ("master",)
        if key not in existing_aliases
    ]
    if alias_rows:
        await ProjectEnvironmentAliasRecord.bulk_create(alias_rows, using_db=using_db)
