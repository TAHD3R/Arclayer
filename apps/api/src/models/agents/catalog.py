from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class AgentDefinitionScope(StrEnum):
    SYSTEM = "system"
    WORKSPACE = "workspace"


class AgentLifecycleState(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    ARCHIVED = "archived"


class AgentVersionState(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    RETIRED = "retired"


class AgentDefinitionRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="agent_definitions",
        on_delete=fields.CASCADE,
        null=True,
    )
    stable_key = fields.CharField(max_length=192, unique=True)
    scope = fields.CharEnumField(AgentDefinitionScope, max_length=16, db_index=True)
    slug = fields.CharField(max_length=96, db_index=True)
    display_name = fields.CharField(max_length=128)
    name_i18n_key = fields.CharField(max_length=160, null=True)
    role = fields.CharField(max_length=96)
    role_i18n_key = fields.CharField(max_length=160, null=True)
    description = fields.CharField(max_length=1000)
    description_i18n_key = fields.CharField(max_length=160, null=True)
    avatar_url = fields.CharField(max_length=1024, null=True)
    lifecycle_state = fields.CharEnumField(
        AgentLifecycleState,
        max_length=16,
        default=AgentLifecycleState.ACTIVE,
        db_index=True,
    )
    is_official = fields.BooleanField(default=False, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "agent_definitions"
        unique_together = (("workspace_id", "slug"),)
        indexes = (("scope", "lifecycle_state"),)
        abstract = False


class AgentVersionRecord(BaseModel):
    definition = fields.ForeignKeyField(
        "models.AgentDefinitionRecord",
        related_name="versions",
        on_delete=fields.CASCADE,
    )
    version_number = fields.IntField()
    state = fields.CharEnumField(AgentVersionState, max_length=16, db_index=True)
    instructions = fields.TextField()
    model_policy = fields.JSONField(default=dict)
    supported_execution_modes = fields.JSONField(default=list)
    tool_grants = fields.JSONField(default=list)
    skill_grant_workspace_id = fields.UUIDField(null=True, db_index=True)
    skill_installation_ids = fields.JSONField(default=list)
    knowledge_base_ids = fields.JSONField(default=list)
    delegation_definition_ids = fields.JSONField(default=list)
    approval_profile = fields.JSONField(default=dict)
    compatibility = fields.JSONField(default=dict)
    provenance = fields.JSONField(default=dict)
    content_checksum = fields.CharField(max_length=64)
    published_at = fields.DatetimeField(null=True, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        definition_id: UUID

    class Meta(BaseModel.Meta):
        table = "agent_versions"
        unique_together = (("definition_id", "version_number"),)
        indexes = (("definition_id", "state"),)
        abstract = False


class AgentAssignmentRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="agent_assignments",
        on_delete=fields.CASCADE,
    )
    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="agent_assignments",
        on_delete=fields.CASCADE,
        null=True,
    )
    definition = fields.ForeignKeyField(
        "models.AgentDefinitionRecord",
        related_name="assignments",
        on_delete=fields.CASCADE,
    )
    version = fields.ForeignKeyField(
        "models.AgentVersionRecord",
        related_name="assignments",
        on_delete=fields.RESTRICT,
    )
    assignment_key = fields.CharField(max_length=256, unique=True)
    enabled = fields.BooleanField(default=True, db_index=True)
    is_default = fields.BooleanField(default=False, db_index=True)
    is_pinned = fields.BooleanField(default=False, db_index=True)
    sort_order = fields.IntField(default=0)
    last_used_at = fields.DatetimeField(null=True, db_index=True)
    assigned_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID | None
        definition_id: UUID
        version_id: UUID

    class Meta(BaseModel.Meta):
        table = "agent_assignments"
        indexes = (
            ("workspace_id", "project_id", "enabled"),
            ("workspace_id", "is_pinned", "last_used_at"),
        )
        abstract = False
