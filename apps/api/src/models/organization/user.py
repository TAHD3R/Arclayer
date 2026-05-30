from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class UserStatus(StrEnum):
    """User status."""

    ACTIVE = "active"
    DISABLED = "disabled"
    LOCKED = "locked"


# User account.
class User(BaseModel):
    """Domain model for users."""

    username = fields.CharField(max_length=64, unique=True, db_index=True)
    email = fields.CharField(max_length=255, null=True, unique=True)
    status = fields.CharEnumField(UserStatus, default=UserStatus.ACTIVE, db_index=True)
    # System-wide super admin flag (instance governance). Only trusted operators should have this.
    is_super_admin = fields.BooleanField(default=False, db_index=True)
    display_name = fields.CharField(max_length=64, null=True)
    avatar_url = fields.CharField(max_length=512, null=True)
    # New canonical avatar reference. Public URL is derived from Asset delivery, not stored here.
    avatar_asset_id = fields.UUIDField(null=True, db_index=True)
    email_verified_at = fields.DatetimeField(null=True, db_index=True)
    last_login_at = fields.DatetimeField(null=True)
    token_version = fields.IntField(default=0, db_index=True)

    class Meta(BaseModel.Meta):
        table = "domain_users"
        abstract = False


# User credential (password hash).
class UserCredential(BaseModel):
    """Domain model for user credentials."""

    user = fields.OneToOneField("models.User", related_name="credential", on_delete=fields.CASCADE)
    password_hash = fields.CharField(max_length=255)
    password_updated_at = fields.DatetimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        table = "domain_user_credentials"
        abstract = False
