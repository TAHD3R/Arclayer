from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from apps.api.models.base import BaseModel


class AssetPurpose(StrEnum):
    AVATAR = "avatar"
    SITE_LOGO = "site_logo"
    FAVICON = "favicon"
    LIBRARY = "library"
    ATTACHMENT = "attachment"
    ARTICLE_COVER = "article_cover"


class AssetVisibility(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"
    SHARED = "shared"


class AssetRecord(BaseModel):
    """
    Immutable blob metadata.

    Notes:
    - Replacing an image (avatar/cover/logo) should create a new AssetRecord and update references.
    - Physical deletion is handled by the recycle bin retention policy (default: 90 days).
    """

    org_id = fields.UUIDField(db_index=True)
    owner_user_id = fields.UUIDField(null=True, db_index=True)
    folder = fields.ForeignKeyField(
        "models.AssetFolderRecord",
        related_name="assets",
        null=True,
        on_delete=fields.SET_NULL,
    )

    purpose = fields.CharEnumField(AssetPurpose, db_index=True)
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
    object_key = fields.CharField(max_length=1024)
    variants = fields.JSONField(null=True)
    meta = fields.JSONField(null=True)

    deleted_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "assets"
        abstract = False
