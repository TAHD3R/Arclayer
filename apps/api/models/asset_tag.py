from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class AssetTagRecord(BaseModel):
    """
    Simple asset tag (workspace-scoped in v2).

    Kept minimal for now; we can extend with color/slug later.
    """

    workspace_id = fields.UUIDField(db_index=True)
    name = fields.CharField(max_length=64)

    class Meta(BaseModel.Meta):
        table = "asset_tags"
        abstract = False
        unique_together = (("workspace_id", "name"),)


class AssetTagLinkRecord(BaseModel):
    """
    Many-to-many link between assets and tags.
    """

    asset = fields.ForeignKeyField("models.AssetRecord", related_name="tag_links", on_delete=fields.CASCADE)
    tag = fields.ForeignKeyField("models.AssetTagRecord", related_name="asset_links", on_delete=fields.CASCADE)

    class Meta(BaseModel.Meta):
        table = "asset_tag_links"
        abstract = False
        unique_together = (("asset_id", "tag_id"),)
