from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


class StorageProfileConfigSource(StrEnum):
    DATABASE = "database"
    ENVIRONMENT = "environment"


class StorageProfile(BaseModel):
    profile_key = fields.CharField(max_length=128, db_index=True)
    scope_type = fields.CharField(max_length=32, default=SCOPE_TYPE_SYSTEM, db_index=True)
    scope_id = fields.UUIDField(default=SYSTEM_SCOPE_ID, db_index=True)
    provider = fields.CharField(max_length=64, db_index=True)
    config_source = fields.CharEnumField(
        StorageProfileConfigSource,
        max_length=16,
        default=StorageProfileConfigSource.DATABASE,
        db_default=StorageProfileConfigSource.DATABASE,
    )
    display_name = fields.CharField(max_length=128)
    config = fields.JSONField(default=dict)
    secret_ref = fields.JSONField(default=dict)
    is_active = fields.BooleanField(default=True, db_index=True)
    is_default = fields.BooleanField(default=False, db_index=True)
    last_test_status = fields.CharField(max_length=32, null=True)
    last_test_message = fields.TextField(null=True)
    last_tested_at = fields.DatetimeField(null=True)
    tombstoned_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        id: UUID

    class Meta(BaseModel.Meta):
        table = "storage_profiles"
        table_description = "Storage provider configuration profiles."
        abstract = False
        unique_together = (("scope_type", "scope_id", "profile_key"),)
        indexes = (("tombstoned_at",),)


class StorageProfileRouteRevision(BaseModel):
    """Append-only, non-secret provider route used by durable effects."""

    profile = fields.ForeignKeyField(
        "models.StorageProfile",
        related_name="route_revisions",
        on_delete=fields.RESTRICT,
    )
    revision_number = fields.IntField()
    route = fields.JSONField()
    route_hash = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        profile_id: UUID

    class Meta(BaseModel.Meta):
        table = "storage_profile_route_revisions"
        table_description = "Immutable non-secret storage provider route revisions."
        abstract = False
        unique_together = (
            ("profile_id", "revision_number"),
            ("profile_id", "route_hash"),
        )


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
