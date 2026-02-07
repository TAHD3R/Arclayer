from __future__ import annotations

from tortoise import fields

from apps.api.common.models.base import BaseModel


class OAuthIdentity(BaseModel):
    """
    OAuth identity mapping (provider subject -> local user).

    Notes:
    - We only store stable identifiers and public profile fields for debugging.
    - We DO NOT store provider access/refresh tokens.
    """

    provider = fields.CharField(max_length=32, db_index=True)
    subject = fields.CharField(max_length=128, db_index=True)

    user_id = fields.UUIDField(db_index=True)

    # Best-effort, for diagnostics only.
    email = fields.CharField(max_length=255, null=True)

    class Meta(BaseModel.Meta):
        table = "oauth_identities"
        abstract = False
        unique_together = (("provider", "subject"),)
        index_together = (("user_id", "provider"),)

