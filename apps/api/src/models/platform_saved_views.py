from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


class PlatformSavedView(BaseModel):
    """Revisioned, actor-private Platform list presentation intent."""

    actor_user_id = fields.UUIDField(db_index=True)
    capability_id = fields.CharField(max_length=128, db_index=True)
    name = fields.CharField(max_length=128)
    filter_schema_revision = fields.CharField(max_length=64)
    column_schema_revision = fields.CharField(max_length=64)
    filters = fields.JSONField()
    ordering = fields.JSONField()
    visible_columns = fields.JSONField()
    column_order = fields.JSONField()
    density = fields.CharField(max_length=32)
    revision = fields.BigIntField(default=1)

    class Meta(BaseModel.Meta):
        table = "platform_saved_views"
        table_description = "Actor-private revisioned Platform saved list views."
        abstract = False
        unique_together = (("actor_user_id", "capability_id", "name"),)
