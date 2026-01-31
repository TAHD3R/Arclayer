from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class OrganizationInvitation(BaseModel):
    """
    Organization invitation for onboarding new members without public registration.
    """

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="invitations",
        on_delete=fields.CASCADE,
    )
    email = fields.CharField(max_length=255, db_index=True)
    role_code = fields.CharField(max_length=64, null=True, db_index=True)

    # NOTE: token_hash is NOT unique because a single reusable invite link can be delivered to multiple emails.
    # We still index it for lookup and auditing.
    token_hash = fields.CharField(max_length=64, db_index=True)
    expires_at = fields.DatetimeField(null=True, db_index=True)

    invited_by_user_id = fields.UUIDField(null=True, db_index=True)
    accepted_by_user_id = fields.UUIDField(null=True, db_index=True)
    accepted_at = fields.DatetimeField(null=True)

    revoked_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "organization_invitations"
        abstract = False


class OrganizationInviteLink(BaseModel):
    """
    Reusable organization invite link.

    Notes:
    - This is NOT bound to a specific email (unlike OrganizationInvitation).
    - We store only the token hash; the raw token is returned once on creation.
    - `code` is a non-secret identifier used for UI display.
    """

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="invite_links",
        on_delete=fields.CASCADE,
    )

    role_code = fields.CharField(max_length=64, null=True, db_index=True)

    # Secret token (stored as hash only).
    token_hash = fields.CharField(max_length=64, unique=True, db_index=True)
    # Non-secret identifier for UI; can be used to quickly reference a link.
    code = fields.CharField(max_length=32, unique=True, db_index=True)

    expires_at = fields.DatetimeField(null=True, db_index=True)
    disabled_at = fields.DatetimeField(null=True, db_index=True)

    # Audit / usage tracking (optional, best-effort).
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    uses_count = fields.IntField(default=0)
    last_used_by_user_id = fields.UUIDField(null=True, db_index=True)
    last_used_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "organization_invite_links"
        abstract = False
