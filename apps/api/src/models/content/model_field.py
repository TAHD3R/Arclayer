from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.content._enums import ContentModelFieldType


class ContentModelFieldRecord(BaseModel):
    """Domain model for content model field records."""

    model_definition = fields.ForeignKeyField(
        "models.ContentModelDefinitionRecord",
        related_name="fields",
        on_delete=fields.CASCADE,
    )

    key = fields.CharField(max_length=64, db_index=True)
    label = fields.CharField(max_length=128)
    field_type = fields.CharEnumField(ContentModelFieldType, max_length=32, db_index=True)
    is_required = fields.BooleanField(default=False)
    default_value = fields.JSONField(null=True)
    config = fields.JSONField(null=True)
    sort_order = fields.IntField(default=0)

    if TYPE_CHECKING:
        model_definition_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_model_fields"
        table_description = "Field definitions within content model schemas."
        abstract = False
        unique_together = (("model_definition_id", "key"),)
