from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class ApiKeyFamily(StrEnum):
    """API key family."""

    PERSONAL_MANAGEMENT = "personal_management"
    WORKSPACE_SERVICE = "workspace_service"
    DELIVERY = "delivery"


class DeliveryKeyPerspective(StrEnum):
    """Delivery key perspective boundary."""

    PUBLISHED = "published"
    PREVIEW = "preview"


class ApiKeyRecord(BaseModel):
    """Domain model for API key records."""

    owner_user = fields.ForeignKeyField(
        "models.User",
        related_name="api_keys",
        null=True,
        on_delete=fields.CASCADE,
    )
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="api_keys",
        null=True,
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="api_keys",
        null=True,
        on_delete=fields.CASCADE,
    )

    key_family = fields.CharEnumField(ApiKeyFamily, max_length=32, db_index=True)
    delivery_perspective = fields.CharEnumField(
        DeliveryKeyPerspective,
        max_length=16,
        null=True,
        db_index=True,
    )

    name = fields.CharField(max_length=128)
    description = fields.CharField(max_length=512, null=True)
    token_public_id = fields.CharField(max_length=32, unique=True, db_index=True)
    token_hash = fields.CharField(max_length=64, unique=True, db_index=True)
    token_mask = fields.CharField(max_length=128)
    scopes = fields.JSONField(null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    last_used_at = fields.DatetimeField(null=True, db_index=True)
    expires_at = fields.DatetimeField(null=True, db_index=True)
    revoked_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        owner_user_id: UUID | None
        workspace_id: UUID | None
        site_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "api_keys"
        table_description = "API key records for project-level access."
        abstract = False
