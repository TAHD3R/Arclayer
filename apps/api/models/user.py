from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from apps.api.models.base import BaseModel


class UserStatus(StrEnum):
    """User status."""

    ACTIVE = "active"
    DISABLED = "disabled"
    LOCKED = "locked"


class User(BaseModel):
    """User account (org-agnostic identity)."""

    username = fields.CharField(max_length=64, unique=True, db_index=True)
    email = fields.CharField(max_length=255, null=True, unique=True)
    status = fields.CharEnumField(UserStatus, default=UserStatus.ACTIVE, db_index=True)
    display_name = fields.CharField(max_length=64, null=True)
    avatar_url = fields.CharField(max_length=512, null=True)
    # New canonical avatar reference. Public URL is derived from Asset delivery, not stored here.
    avatar_asset_id = fields.UUIDField(null=True, db_index=True)
    last_login_at = fields.DatetimeField(null=True)
    token_version = fields.IntField(default=0, db_index=True)

    if TYPE_CHECKING:
        username: str
        email: str | None
        status: UserStatus
        display_name: str | None
        avatar_url: str | None
        avatar_asset_id: UUID | None
        last_login_at: datetime | None
        token_version: int
        credential: UserCredential | None

    class Meta(BaseModel.Meta):
        table = "users"
        abstract = False


class UserCredential(BaseModel):
    """User credential record (password hash)."""

    user = fields.OneToOneField("models.User", related_name="credential", on_delete=fields.CASCADE)
    password_hash = fields.CharField(max_length=255)
    password_updated_at = fields.DatetimeField(auto_now_add=True)

    if TYPE_CHECKING:
        user_id: UUID
        password_hash: str
        password_updated_at: datetime

    class Meta(BaseModel.Meta):
        table = "user_credentials"
        abstract = False
