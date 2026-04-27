from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.fields.relational import ReverseRelation

from src.common.models import BaseModel
from src.models.content._enums import (
    ContentContinuationPosture,
    ContentContinuationRole,
    ContentContinuationSurface,
)


class ContentModelDefinitionRecord(BaseModel):
    """Domain model for content model definition records."""

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

    singular_key = fields.CharField(max_length=64, db_index=True)
    plural_key = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.CharField(max_length=512, null=True)
    category = fields.CharField(max_length=32, default="custom", db_index=True)
    model_kind = fields.CharField(max_length=32, default="collection_type", db_index=True)
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
    protocol_key = fields.CharField(max_length=64, null=True, db_index=True)
    protocol_version = fields.IntField(default=1)
    is_system_managed = fields.BooleanField(default=False, db_index=True)
    system_field_keys = fields.JSONField(null=True)
    draft_contract_revision = fields.IntField(default=1)
    published_contract_revision = fields.IntField(null=True)
    published_contract_snapshot = fields.JSONField(null=True)
    capabilities = fields.JSONField(null=True)
    routing_policy = fields.JSONField(null=True)
    presentation_policy = fields.JSONField(null=True)
    seo_policy = fields.JSONField(null=True)
    workflow_policy = fields.JSONField(null=True)

    if TYPE_CHECKING:
        from src.models.content.model_field import ContentModelFieldRecord
        from src.models.content.model_relation import ContentModelRelationRecord
        from src.models.content.model_view import ContentModelViewRecord

        workspace_id: UUID
        site_id: UUID
        fields: ReverseRelation[ContentModelFieldRecord]
        relations: ReverseRelation[ContentModelRelationRecord]
        views: ReverseRelation[ContentModelViewRecord]

    class Meta(BaseModel.Meta):
        table = "domain_content_model_definitions"
        abstract = False
        unique_together = (
            ("workspace_id", "site_id", "singular_key"),
            ("workspace_id", "site_id", "plural_key"),
        )
