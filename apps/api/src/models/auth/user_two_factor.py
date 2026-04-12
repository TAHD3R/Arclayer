from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


class UserTwoFactor(BaseModel):
    """
    User TOTP (2FA) configuration.

    - `totp_secret_enc` is stored encrypted at rest.
    - `enabled_at` is null until the user confirms setup.
    """

    user = fields.OneToOneField("models.User", related_name="two_factor", on_delete=fields.CASCADE)
    totp_secret_enc = fields.CharField(max_length=1024)
    enabled_at = fields.DatetimeField(null=True)
    last_totp_counter = fields.BigIntField(null=True)
    last_totp_used_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "user_two_factor"
        abstract = False


class UserTwoFactorBackupCode(BaseModel):
    """
    One-time backup codes for 2FA.

    Stores only a salted hash; plain codes are never persisted.
    """

    user = fields.ForeignKeyField("models.User", related_name="two_factor_backup_codes", on_delete=fields.CASCADE)
    salt = fields.CharField(max_length=64)
    code_hash = fields.CharField(max_length=128)
    used_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "user_two_factor_backup_codes"
        abstract = False
