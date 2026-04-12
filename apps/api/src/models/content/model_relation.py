from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.content._enums import ContentModelRelationType


class ContentModelRelationRecord(BaseModel):
    """Relation contract between rebuilt content models."""

    model_definition = fields.ForeignKeyField(
        "models.ContentModelDefinitionRecord",
        related_name="relations",
        on_delete=fields.CASCADE,
    )
    target_model_definition = fields.ForeignKeyField(
        "models.ContentModelDefinitionRecord",
        related_name="incoming_relations",
        null=True,
        on_delete=fields.SET_NULL,
    )
    target_model_key = fields.CharField(max_length=64, db_index=True)

    key = fields.CharField(max_length=64, db_index=True)
    relation_type = fields.CharEnumField(ContentModelRelationType, max_length=32, db_index=True)
    is_required = fields.BooleanField(default=False)
    config = fields.JSONField(null=True)
    sort_order = fields.IntField(default=0)

    if TYPE_CHECKING:
        model_definition_id: UUID
        target_model_definition_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "content_model_relations"
        abstract = False
        unique_together = (("model_definition_id", "key"),)
