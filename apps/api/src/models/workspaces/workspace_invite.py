from __future__ import annotations

from tortoise import fields

from src.common.models.base import BaseModel


# Workspace email invite (pending membership invitation).
class WorkspaceEmailInvite(BaseModel):
    """
    Email-bound invite (Pending/Accepted list).

    Rules (v2):
    - Email-bound: accept requires current_user.email == invite.email.
    - Q1: renew only extends expires_at (does not rotate code).
    - Q2: only one active (non-revoked, non-accepted) invite per (workspace, email).
    - Q3: delete means revoke (revoked_at is set).
    """

    organization = fields.ForeignKeyField(
        "models.Organization", related_name="workspace_email_invites", on_delete=fields.CASCADE
    )
    workspace = fields.ForeignKeyField("models.Workspace", related_name="email_invites", on_delete=fields.CASCADE)

    email = fields.CharField(max_length=255, db_index=True)
    role_code = fields.CharField(max_length=64, null=True, db_index=True)

    # Non-secret identifier used to build a signed invite token.
    code = fields.CharField(max_length=64, unique=True, db_index=True)

    expires_at = fields.DatetimeField(null=True, db_index=True)

    created_by_user_id = fields.UUIDField(db_index=True)

    accepted_by_user_id = fields.UUIDField(null=True, db_index=True)
    accepted_at = fields.DatetimeField(null=True, db_index=True)

    revoked_by_user_id = fields.UUIDField(null=True, db_index=True)
    revoked_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "workspace_email_invites"
        abstract = False


# Workspace invite link (reusable invite token).
class WorkspaceInviteLink(BaseModel):
    """
    Reusable invite link.

    Rules (v2):
    - Q4: max_uses is optional; NULL means unlimited.
    - Q5: allowed_email_domain is optional; when set, only matching emails can accept.
    """

    organization = fields.ForeignKeyField(
        "models.Organization", related_name="workspace_invite_links", on_delete=fields.CASCADE
    )
    workspace = fields.ForeignKeyField("models.Workspace", related_name="invite_links", on_delete=fields.CASCADE)

    role_code = fields.CharField(max_length=64, null=True, db_index=True)

    # Non-secret identifier used to build a signed invite token (copyable at any time).
    code = fields.CharField(max_length=64, unique=True, db_index=True)
    # Non-secret short code for UI display/search.
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
        table = "workspace_invite_links"
        abstract = False


# Workspace invite link use event (audit trail).
class WorkspaceInviteLinkUseEvent(BaseModel):
    """Invite link usage event (participants)."""

    link = fields.ForeignKeyField(
        "models.WorkspaceInviteLink",
        related_name="use_events",
        on_delete=fields.CASCADE,
    )
    used_by_user_id = fields.UUIDField(db_index=True)
    used_at = fields.DatetimeField(db_index=True)
    joined_membership_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "workspace_invite_link_use_events"
        abstract = False
        index_together = (("link_id", "used_at"),)
