from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class ProjectMemberRole(StrEnum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class ProjectMembership(BaseModel):
    """Project-scoped member role binding."""

    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="memberships",
        on_delete=fields.CASCADE,
    )
    user = fields.ForeignKeyField(
        "models.User",
        related_name="project_memberships",
        on_delete=fields.CASCADE,
    )
    role = fields.CharEnumField(ProjectMemberRole, default=ProjectMemberRole.EDITOR, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        project_id: UUID
        user_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_project_memberships"
        abstract = False
        unique_together = (("project_id", "user_id"),)
