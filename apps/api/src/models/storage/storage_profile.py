from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


class StorageProfileRecord(BaseModel):
    profile_key = fields.CharField(max_length=128, db_index=True)
    scope_type = fields.CharField(max_length=32, default=SCOPE_TYPE_SYSTEM, db_index=True)
    scope_id = fields.UUIDField(default=SYSTEM_SCOPE_ID, db_index=True)
    provider = fields.CharField(max_length=64, db_index=True)
    display_name = fields.CharField(max_length=128)
    config = fields.JSONField(default=dict)
    secret_ref = fields.JSONField(default=dict)
    is_active = fields.BooleanField(default=True, db_index=True)
    is_default = fields.BooleanField(default=False, db_index=True)
    last_test_status = fields.CharField(max_length=32, null=True)
    last_test_message = fields.TextField(null=True)
    last_tested_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "system_storage_profiles"
        abstract = False
        unique_together = (("scope_type", "scope_id", "profile_key"),)


class StorageProfileTestStateRecord(BaseModel):
    scope_type = fields.CharField(max_length=32, default=SCOPE_TYPE_SYSTEM, db_index=True)
    scope_id = fields.UUIDField(default=SYSTEM_SCOPE_ID, db_index=True)
    profile_key = fields.CharField(max_length=128, db_index=True)
    last_test_status = fields.CharField(max_length=32)
    last_test_message = fields.TextField(null=True)
    last_tested_at = fields.DatetimeField()

    class Meta(BaseModel.Meta):
        table = "system_storage_profile_test_states"
        abstract = False
        unique_together = (("scope_type", "scope_id", "profile_key"),)
