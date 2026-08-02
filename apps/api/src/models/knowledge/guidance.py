from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.knowledge._enums import (
    KnowledgeGuidanceCommandKind,
    KnowledgeGuidancePreviewKind,
    KnowledgeGuidancePreviewStatus,
    KnowledgeGuidanceRevisionStatus,
    KnowledgeGuidanceScope,
    KnowledgeProjectGuidanceMode,
)


class KnowledgeGuidanceLayerRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="knowledge_guidance_layers",
        on_delete=fields.CASCADE,
    )
    scope_kind = fields.CharEnumField(KnowledgeGuidanceScope, max_length=16, db_index=True)
    scope_id = fields.UUIDField(db_index=True)
    project_mode = fields.CharEnumField(
        KnowledgeProjectGuidanceMode,
        max_length=16,
        null=True,
    )
    metadata_revision = fields.IntField(default=1)
    draft_revision_id = fields.UUIDField(null=True, db_index=True)
    published_revision_id = fields.UUIDField(null=True, db_index=True)
    removed_at = fields.DatetimeField(null=True)
    removed_by_user_id = fields.UUIDField(null=True, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID

    class Meta(BaseModel.Meta):
        table = "knowledge_guidance_layers"
        table_description = "Canonical Workspace and Project guidance layers."
        abstract = False
        unique_together = (("workspace_id", "scope_kind", "scope_id"),)
        indexes = (("workspace_id", "scope_kind", "updated_at"),)


class KnowledgeGuidanceRevisionRecord(BaseModel):
    guidance_layer = fields.ForeignKeyField(
        "models.KnowledgeGuidanceLayerRecord",
        related_name="revisions",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    revision_number = fields.IntField()
    content = fields.TextField()
    content_hash = fields.CharField(max_length=71, db_index=True)
    status = fields.CharEnumField(
        KnowledgeGuidanceRevisionStatus,
        max_length=16,
        default=KnowledgeGuidanceRevisionStatus.DRAFT,
        db_index=True,
    )
    restored_from_revision_id = fields.UUIDField(null=True, db_index=True)
    published_at = fields.DatetimeField(null=True)
    published_by_user_id = fields.UUIDField(null=True, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        guidance_layer_id: UUID

    class Meta(BaseModel.Meta):
        table = "knowledge_guidance_revisions"
        table_description = "Immutable content revisions for canonical Knowledge guidance."
        abstract = False
        unique_together = (
            ("guidance_layer_id", "revision_number"),
            ("guidance_layer_id", "request_idempotency_key"),
        )
        indexes = (("workspace_id", "guidance_layer_id", "status"),)


class KnowledgeGuidanceReferenceRecord(BaseModel):
    guidance_layer = fields.ForeignKeyField(
        "models.KnowledgeGuidanceLayerRecord",
        related_name="references",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    knowledge_base_id = fields.UUIDField(db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        guidance_layer_id: UUID

    class Meta(BaseModel.Meta):
        table = "knowledge_guidance_references"
        table_description = "Optional existing Knowledge source collections attached to canonical guidance."
        abstract = False
        unique_together = (("guidance_layer_id", "knowledge_base_id"),)
        indexes = (("workspace_id", "knowledge_base_id"),)


class KnowledgeGuidancePreviewRecord(BaseModel):
    guidance_layer = fields.ForeignKeyField(
        "models.KnowledgeGuidanceLayerRecord",
        related_name="previews",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    kind = fields.CharEnumField(KnowledgeGuidancePreviewKind, max_length=16, db_index=True)
    status = fields.CharEnumField(
        KnowledgeGuidancePreviewStatus,
        max_length=16,
        default=KnowledgeGuidancePreviewStatus.ACTIVE,
        db_index=True,
    )
    expected_layer_revision = fields.IntField()
    preview_revision = fields.IntField(default=1)
    source_revision_id = fields.UUIDField(null=True, db_index=True)
    snapshot = fields.JSONField(default=dict)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    applied_at = fields.DatetimeField(null=True)
    applied_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        guidance_layer_id: UUID

    class Meta(BaseModel.Meta):
        table = "knowledge_guidance_previews"
        table_description = "Revision-bound restore and removal previews for canonical Knowledge guidance."
        abstract = False
        unique_together = (("guidance_layer_id", "kind", "request_idempotency_key"),)
        indexes = (("workspace_id", "guidance_layer_id", "status"),)


class KnowledgeGuidanceCommandRecord(BaseModel):
    guidance_layer = fields.ForeignKeyField(
        "models.KnowledgeGuidanceLayerRecord",
        related_name="commands",
        on_delete=fields.CASCADE,
    )
    workspace_id = fields.UUIDField(db_index=True)
    kind = fields.CharEnumField(KnowledgeGuidanceCommandKind, max_length=32, db_index=True)
    request_idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    result_snapshot = fields.JSONField()
    actor_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        guidance_layer_id: UUID

    class Meta(BaseModel.Meta):
        table = "knowledge_guidance_commands"
        table_description = "Idempotent command receipts for canonical Knowledge guidance mutations."
        abstract = False
        unique_together = (("guidance_layer_id", "kind", "request_idempotency_key"),)
        indexes = (("workspace_id", "guidance_layer_id", "kind"),)
