from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class AssetPurpose(StrEnum):
    """Asset purpose category (used for validation and policies)."""

    AVATAR = "avatar"
    SITE_LOGO = "site_logo"
    WORKSPACE_ICON = "workspace_icon"
    FAVICON = "favicon"
    LIBRARY = "library"
    ATTACHMENT = "attachment"
    ARTICLE_COVER = "article_cover"


class AssetVisibility(StrEnum):
    """Asset visibility."""

    PUBLIC = "public"
    PRIVATE = "private"
    SHARED = "shared"


# Asset record (immutable blob metadata).
class AssetRecord(BaseModel):
    """Domain model for asset records.

    Immutable blob metadata.

    Notes:
    - Replacing an image (avatar/cover/logo) should create a new AssetRecord and update references.
    - Physical deletion is handled by the recycle bin retention policy (default: 90 days).
    """

    # Exactly one scope id must be set (enforced at service boundary).
    workspace_id = fields.UUIDField(null=True, db_index=True)
    project_id = fields.UUIDField(null=True, db_index=True)
    organization_id = fields.UUIDField(null=True, db_index=True)
    user_id = fields.UUIDField(null=True, db_index=True)
    owner_user_id = fields.UUIDField(null=True, db_index=True)
    folder = fields.ForeignKeyField(
        "models.AssetFolderRecord",
        related_name="assets",
        null=True,
        on_delete=fields.SET_NULL,
    )

    # Keep purpose max length generous to avoid enum-growth breaking existing DB schemas.
    purpose = fields.CharEnumField(AssetPurpose, db_index=True, max_length=64)
    visibility = fields.CharEnumField(AssetVisibility, default=AssetVisibility.PUBLIC, db_index=True)
    indexable = fields.BooleanField(default=False, db_index=True)

    title = fields.CharField(max_length=256, null=True)
    slug = fields.CharField(max_length=128, null=True)
    original_filename = fields.CharField(max_length=255, null=True)

    mime = fields.CharField(max_length=128, null=True)
    ext = fields.CharField(max_length=32, null=True)
    size_bytes = fields.BigIntField(default=0)
    checksum_sha256 = fields.CharField(max_length=64, null=True, db_index=True)

    storage_provider = fields.CharField(max_length=32, default="local")
    storage_profile_key = fields.CharField(max_length=128, null=True, db_index=True)
    # S3 bucket used for this asset (for dual-bucket deployments). Null for local storage.
    storage_bucket = fields.CharField(max_length=255, null=True, db_index=True)
    object_key = fields.CharField(max_length=1024)
    variants = fields.JSONField(null=True)
    meta = fields.JSONField(null=True)

    deleted_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "domain_assets"
        abstract = False
