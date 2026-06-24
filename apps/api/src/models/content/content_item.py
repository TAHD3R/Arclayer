from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.content._enums import (
    ContentBootstrapPresetState,
    ContentContinuationPosture,
    ContentContinuationRole,
    ContentContinuationSurface,
    ContentItemStatus,
    ContentItemVisibility,
    ContentShapeState,
    ContentWorkflowStage,
)


class ContentItemRecord(BaseModel):
    """Domain model for content item records."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_items",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_items",
        on_delete=fields.CASCADE,
    )
    environment = fields.ForeignKeyField(
        "models.ProjectEnvironmentRecord",
        related_name="content_items",
        on_delete=fields.CASCADE,
        null=True,
    )
    model_definition = fields.ForeignKeyField(
        "models.ContentModelDefinitionRecord",
        related_name="items",
        on_delete=fields.CASCADE,
        null=True,
    )
    translation_group = fields.ForeignKeyField(
        "models.TranslationGroupRecord",
        related_name="items",
        on_delete=fields.SET_NULL,
        null=True,
    )

    slug = fields.CharField(max_length=256, db_index=True)
    title = fields.CharField(max_length=256, null=True)
    status = fields.CharEnumField(
        ContentItemStatus,
        max_length=16,
        default=ContentItemStatus.DRAFT,
        db_index=True,
    )
    visibility = fields.CharEnumField(
        ContentItemVisibility,
        max_length=16,
        default=ContentItemVisibility.PUBLIC,
        db_index=True,
    )
    locale = fields.CharField(max_length=16, default="zh-CN", db_index=True)
    bootstrap_preset_key = fields.CharField(max_length=64, null=True, db_index=True)
    bootstrap_preset_state = fields.CharEnumField(
        ContentBootstrapPresetState,
        max_length=16,
        default=ContentBootstrapPresetState.NONE,
        db_index=True,
    )
    capability_pack_ids = fields.JSONField(default=list)
    resolved_role = fields.CharEnumField(
        ContentContinuationRole,
        max_length=32,
        null=True,
        db_index=True,
    )
    resolved_posture = fields.CharEnumField(
        ContentContinuationPosture,
        max_length=32,
        null=True,
        db_index=True,
    )
    resolved_surface = fields.CharEnumField(
        ContentContinuationSurface,
        max_length=32,
        null=True,
        db_index=True,
    )
    shape_state = fields.CharEnumField(
        ContentShapeState,
        max_length=16,
        default=ContentShapeState.UNSHAPED,
        db_index=True,
    )
    shape_reason_code = fields.CharField(max_length=64, null=True, db_index=True)
    shape_reason_meta = fields.JSONField(null=True)
    workflow_stage = fields.CharEnumField(
        ContentWorkflowStage,
        max_length=24,
        default=ContentWorkflowStage.DRAFTING,
        db_index=True,
    )
    workflow_assignee_user_id = fields.UUIDField(null=True, db_index=True)
    workflow_summary = fields.CharField(max_length=256, null=True)
    workflow_notes = fields.JSONField(null=True)

    draft_version = fields.IntField(default=0)
    published_version = fields.IntField(null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID
        environment_id: UUID | None
        model_definition_id: UUID | None
        translation_group_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "content_items"
        table_description = "Content item records with versioned data per locale."
        abstract = False
        unique_together = (("model_definition_id", "environment_id", "locale", "slug"),)
