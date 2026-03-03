from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class ThemePackageRecord(BaseModel):
    """
    Installed theme package (workspace-scoped).

    Notes:
    - The package is treated as an immutable artifact identified by (theme_id, version).
    - v0 forbids executable code inside the package; only static resources are allowed.
    - We keep entrypoint assets as AssetRecord ids to reuse the existing public asset delivery path.
    """

    workspace_id = fields.UUIDField(db_index=True)

    theme_id = fields.CharField(max_length=214, db_index=True)
    version = fields.CharField(max_length=64, db_index=True)

    name = fields.CharField(max_length=128, null=True)
    description = fields.CharField(max_length=512, null=True)
    author = fields.JSONField(null=True)

    # Raw manifest.json (kept for future compatibility / re-export).
    manifest = fields.JSONField()

    # Immutable artifact bookkeeping.
    artifact_hash = fields.CharField(max_length=64, null=True, db_index=True)
    artifact_asset_id = fields.UUIDField(null=True)

    # Entrypoints (stored as assets for delivery + caching).
    tokens_css_asset_id = fields.UUIDField()
    base_css_asset_id = fields.UUIDField(null=True)
    preview_image_asset_id = fields.UUIDField(null=True)

    # Optional metadata extracted during import (kept small and immutable per record).
    presets = fields.JSONField(null=True)
    variants = fields.JSONField(null=True)

    created_by = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "theme_packages"
        abstract = False
        unique_together = (("workspace_id", "theme_id", "version"),)
        indexes = (("workspace_id", "theme_id"),)
