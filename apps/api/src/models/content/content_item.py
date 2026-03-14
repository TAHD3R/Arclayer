from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from apps.api.src.common.models.base import BaseModel
from apps.api.src.models.content._enums import ContentItemStatus, ContentItemVisibility


class ContentItemRecord(BaseModel):
    """Mutable content item state without route/tree blueprint coupling."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_items",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_items",
        on_delete=fields.CASCADE,
    )
    model_definition = fields.ForeignKeyField(
        "models.ContentModelDefinitionRecord",
        related_name="items",
        on_delete=fields.CASCADE,
    )

    slug = fields.CharField(max_length=256, db_index=True)
    title = fields.CharField(max_length=256, null=True)
    status = fields.CharEnumField(
        ContentItemStatus,
        max_length=16,
        default=ContentItemStatus.DRAFT,
        db_index=True,
    )
    visibility = fields.CharEnumField(
        ContentItemVisibility,
        max_length=16,
        default=ContentItemVisibility.PUBLIC,
        db_index=True,
    )
    locale = fields.CharField(max_length=16, default="zh-CN", db_index=True)

    draft_version = fields.IntField(default=0)
    published_version = fields.IntField(null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID
        model_definition_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_items"
        abstract = False
        unique_together = (("model_definition_id", "locale", "slug"),)
