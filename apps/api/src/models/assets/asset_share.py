from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Asset share link (tokenized public access).
class AssetShareLinkRecord(BaseModel):
    """Domain model for asset share link records.

    Link-only share access for a single asset.

    Requirements:
    - Public path: /s/{token}
    - Configurable expiration
    - Read-only access (preview/download)

    Notes:
    - Share links are NOT intended to be indexed: delivery endpoints add `X-Robots-Tag: noindex`.
    - This bypasses Asset visibility; access is gated by the opaque token + expiration + revoked_at.
    """

    workspace_id = fields.UUIDField(db_index=True)
    asset = fields.ForeignKeyField("models.AssetRecord", related_name="share_links", on_delete=fields.CASCADE)

    token = fields.CharField(max_length=64, unique=True, db_index=True)
    expires_at = fields.DatetimeField(null=True, db_index=True)
    revoked_at = fields.DatetimeField(null=True, db_index=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "domain_asset_share_links"
        abstract = False
