from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Organization email invite (pending membership invitation).
class OrganizationEmailInvite(BaseModel):
    """Domain model for organization email invites."""

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="org_email_invites",
        on_delete=fields.CASCADE,
    )

    email = fields.CharField(max_length=255, db_index=True)
    role_code = fields.CharField(max_length=64, default="member", db_index=True)

    code = fields.CharField(max_length=64, unique=True, db_index=True)
    expires_at = fields.DatetimeField(null=True, db_index=True)

    created_by_user_id = fields.UUIDField(db_index=True)

    accepted_by_user_id = fields.UUIDField(null=True, db_index=True)
    accepted_at = fields.DatetimeField(null=True, db_index=True)

    revoked_by_user_id = fields.UUIDField(null=True, db_index=True)
    revoked_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "organization_email_invites"
        table_description = "Pending organization membership invitations sent via email."
        abstract = False


# Organization invite link (reusable invite token).
class OrganizationInviteLink(BaseModel):
    """Domain model for organization invite links."""

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="org_invite_links",
        on_delete=fields.CASCADE,
    )

    role_code = fields.CharField(max_length=64, default="member", db_index=True)

    code = fields.CharField(max_length=64, unique=True, db_index=True)
    display_code = fields.CharField(max_length=32, unique=True, db_index=True)

    expires_at = fields.DatetimeField(null=True, db_index=True)
    disabled_at = fields.DatetimeField(null=True, db_index=True)

    max_uses = fields.IntField(null=True)
    allowed_email_domain = fields.CharField(max_length=128, null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    uses_count = fields.IntField(default=0)
    last_used_by_user_id = fields.UUIDField(null=True, db_index=True)
    last_used_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "organization_invite_links"
        table_description = "Reusable organization invite tokens with usage tracking."
        abstract = False


# Organization invite link use event (audit trail).
class OrganizationInviteLinkUseEvent(BaseModel):
    """Domain model for organization invite link use events."""

    link = fields.ForeignKeyField(
        "models.OrganizationInviteLink",
        related_name="use_events",
        on_delete=fields.CASCADE,
    )
    used_by_user_id = fields.UUIDField(db_index=True)
    used_at = fields.DatetimeField(db_index=True)
    joined_membership_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "organization_invite_link_use_events"
        table_description = "Audit trail for organization invite link usage events."
        abstract = False
        index_together = (("link_id", "used_at"),)
