from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class AssetUsageRecord(BaseModel):
    """
    Asset usage reference (org-scoped).

    Use cases:
    - Track "which business entity / field references which asset".
    - Support "Where used" UI in asset details.
    - Provide impact hints before delete/recycle-bin operations.
    - Enable future cleanup/audit workflows (e.g. unused assets).

    Design notes:
    - `entity_type` is a string convention and should be extensible by plugins
      (e.g. `core.settings`, `plugin.xxx`).
    - `field_key` should use dot paths (e.g. `site.logo`, `seo.og_image`).
    """

    org_id = fields.UUIDField(db_index=True)

    asset = fields.ForeignKeyField(
        "models.AssetRecord",
        related_name="usages",
        on_delete=fields.CASCADE,
    )

    # Usage-level purpose: allow arbitrary strings so it can evolve without DB enum changes.
    purpose = fields.CharField(max_length=64, db_index=True)

    entity_type = fields.CharField(max_length=128, db_index=True)
    entity_id = fields.CharField(max_length=128, db_index=True)
    field_key = fields.CharField(max_length=128, db_index=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "asset_usages"
        abstract = False
        unique_together = (("org_id", "entity_type", "entity_id", "field_key"),)
