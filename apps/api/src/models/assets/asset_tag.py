from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Asset tag (scoped: workspace/org/user).
class AssetTagRecord(BaseModel):
    """Domain model for asset tag records.

    Simple asset tag (scoped in v3).

    Kept minimal for now; we can extend with color/slug later.
    """

    # Exactly one of workspace_id / organization_id / user_id must be set (enforced at service boundary).
    workspace_id = fields.UUIDField(null=True, db_index=True)
    organization_id = fields.UUIDField(null=True, db_index=True)
    user_id = fields.UUIDField(null=True, db_index=True)
    name = fields.CharField(max_length=64)

    class Meta(BaseModel.Meta):
        table = "domain_asset_tags"
        abstract = False
        unique_together = (("workspace_id", "name"), ("organization_id", "name"), ("user_id", "name"))


# Asset-to-tag link (many-to-many).
class AssetTagLinkRecord(BaseModel):
    """Domain model for asset tag link records.

    Many-to-many link between assets and tags.
    """

    asset = fields.ForeignKeyField("models.AssetRecord", related_name="tag_links", on_delete=fields.CASCADE)
    tag = fields.ForeignKeyField("models.AssetTagRecord", related_name="asset_links", on_delete=fields.CASCADE)

    class Meta(BaseModel.Meta):
        table = "domain_asset_tag_links"
        abstract = False
        unique_together = (("asset_id", "tag_id"),)
