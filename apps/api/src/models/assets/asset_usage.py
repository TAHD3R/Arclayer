from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Asset usage reference (best-effort audit).
class AssetUsageRecord(BaseModel):
    """Domain model for asset usage records.

    Asset usage reference (workspace-scoped in v2).

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

    # Exactly one scope id must be set (enforced at service boundary).
    workspace_id = fields.UUIDField(null=True, db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    organization_id = fields.UUIDField(null=True, db_index=True)
    user_id = fields.UUIDField(null=True, db_index=True)

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
        table = "domain_asset_usages"
        abstract = False
        unique_together = (
            ("workspace_id", "entity_type", "entity_id", "field_key"),
            ("project_id", "entity_type", "entity_id", "field_key"),
            ("organization_id", "entity_type", "entity_id", "field_key"),
            ("user_id", "entity_type", "entity_id", "field_key"),
        )
