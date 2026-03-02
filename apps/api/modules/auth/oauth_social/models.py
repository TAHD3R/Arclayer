from __future__ import annotations

from tortoise import fields

from apps.api.common.models.base import BaseModel


class OAuthIdentity(BaseModel):
    """
    OAuth identity mapping (provider subject -> local user).

    Notes:
    - Only stores stable identifiers and public profile fields for diagnostics.
    - Does not store provider access/refresh tokens.
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


# Migration stability:
# The table was historically introduced by the oauth-social plugin with module path
# "oauth_social.models.OAuthIdentity". Keep the same full name to avoid accidental
# drop/recreate migrations when generating schema diffs.
OAuthIdentity.__module__ = "oauth_social.models"
