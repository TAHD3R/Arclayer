from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


class StorageProfile(BaseModel):
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
        table = "storage_profiles"
        table_description = "Storage provider configuration profiles."
        abstract = False
        unique_together = (("scope_type", "scope_id", "profile_key"),)


class StorageProfileTestState(BaseModel):
    scope_type = fields.CharField(max_length=32, default=SCOPE_TYPE_SYSTEM, db_index=True)
    scope_id = fields.UUIDField(default=SYSTEM_SCOPE_ID, db_index=True)
    profile_key = fields.CharField(max_length=128, db_index=True)
    last_test_status = fields.CharField(max_length=32)
    last_test_message = fields.TextField(null=True)
    last_tested_at = fields.DatetimeField()

    class Meta(BaseModel.Meta):
        table = "storage_profile_test_states"
        table_description = "Storage profile connectivity test result records."
        abstract = False
        unique_together = (("scope_type", "scope_id", "profile_key"),)
