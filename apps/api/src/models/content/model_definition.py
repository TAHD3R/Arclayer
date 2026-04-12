from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.content._enums import (
    ContentContinuationPosture,
    ContentContinuationRole,
    ContentContinuationSurface,
)


class ContentModelDefinitionRecord(BaseModel):
    """Rebuilt content model definition scoped by workspace and site."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_model_definitions",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_model_definitions",
        on_delete=fields.CASCADE,
    )

    key = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.CharField(max_length=512, null=True)
    category = fields.CharField(max_length=32, default="custom", db_index=True)
    default_editor = fields.CharField(max_length=32, default="form", db_index=True)
    default_role = fields.CharEnumField(
        ContentContinuationRole,
        max_length=32,
        null=True,
        db_index=True,
    )
    default_posture = fields.CharEnumField(
        ContentContinuationPosture,
        max_length=32,
        null=True,
        db_index=True,
    )
    default_surface = fields.CharEnumField(
        ContentContinuationSurface,
        max_length=32,
        null=True,
        db_index=True,
    )
    starter_pack_policy = fields.JSONField(null=True)
    surface_policy = fields.JSONField(null=True)
    kind = fields.CharField(max_length=64, null=True, db_index=True)

    capabilities = fields.JSONField(null=True)
    routing_policy = fields.JSONField(null=True)
    presentation_policy = fields.JSONField(null=True)
    seo_policy = fields.JSONField(null=True)
    workflow_policy = fields.JSONField(null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_model_definitions"
        abstract = False
        unique_together = (("workspace_id", "site_id", "key"),)
