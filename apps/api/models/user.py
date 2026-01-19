from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from apps.api.models.base import BaseModel


class UserStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    LOCKED = "locked"


class User(BaseModel):
    username = fields.CharField(max_length=64, unique=True, db_index=True)
    email = fields.CharField(max_length=255, null=True, unique=True)
    status = fields.CharEnumField(UserStatus, default=UserStatus.ACTIVE, db_index=True)
    display_name = fields.CharField(max_length=64, null=True)
    avatar_url = fields.CharField(max_length=512, null=True)
    last_login_at = fields.DatetimeField(null=True)
    token_version = fields.IntField(default=0, db_index=True)

    class Meta(BaseModel.Meta):
        table = "users"
        abstract = False


class UserCredential(BaseModel):
    user = fields.OneToOneField("models.User", related_name="credential", on_delete=fields.CASCADE)
    password_hash = fields.CharField(max_length=255)
    password_updated_at = fields.DatetimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        table = "user_credentials"
        abstract = False
