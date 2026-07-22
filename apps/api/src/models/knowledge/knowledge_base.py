from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.knowledge._enums import KnowledgeBaseStatus, KnowledgeVisibility


class KnowledgeBaseRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="knowledge_bases",
        on_delete=fields.CASCADE,
    )
    name = fields.CharField(max_length=128)
    normalized_name = fields.CharField(max_length=128)
    description = fields.CharField(max_length=1000, null=True)
    default_locale = fields.CharField(max_length=32, default="en-US", db_index=True)
    status = fields.CharEnumField(
        KnowledgeBaseStatus,
        max_length=16,
        default=KnowledgeBaseStatus.ACTIVE,
        db_index=True,
    )
    current_policy_revision = fields.IntField(default=1)
    metadata_revision = fields.IntField(default=1)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    deletion_requested_at = fields.DatetimeField(null=True)
    deletion_requested_by_user_id = fields.UUIDField(null=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "knowledge_bases"
        table_description = "Workspace-owned Knowledge base identities."
        abstract = False
        unique_together = (
            ("workspace_id", "normalized_name"),
            ("workspace_id", "request_idempotency_key"),
        )
        indexes = (
            ("workspace_id", "status", "updated_at"),
            ("workspace_id", "request_idempotency_key"),
        )


class KnowledgeAccessPolicyRecord(BaseModel):
    knowledge_base = fields.ForeignKeyField(
        "models.KnowledgeBaseRecord",
        related_name="access_policy_revisions",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    policy_revision = fields.IntField()
    visibility = fields.CharEnumField(
        KnowledgeVisibility,
        max_length=16,
        default=KnowledgeVisibility.WORKSPACE,
        db_index=True,
    )
    allowed_project_ids = fields.JSONField(default=list)
    allowed_role_codes = fields.JSONField(default=list)
    allowed_member_ids = fields.JSONField(default=list)
    allowed_agent_definition_ids = fields.JSONField(default=list)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        knowledge_base_id: UUID

    class Meta(BaseModel.Meta):
        table = "knowledge_access_policies"
        table_description = "Immutable Workspace Knowledge access-policy revisions."
        abstract = False
        unique_together = (("knowledge_base_id", "policy_revision"),)
        indexes = (("workspace_id", "visibility"),)
