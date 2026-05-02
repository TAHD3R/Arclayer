from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class TranslationGroupRecord(BaseModel):
    """Domain model for content translation groups."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_translation_groups",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_translation_groups",
        on_delete=fields.CASCADE,
    )
    primary_item = fields.ForeignKeyField(
        "models.ContentItemRecord",
        related_name="primary_translation_groups",
        on_delete=fields.SET_NULL,
        null=True,
    )
    primary_locale = fields.CharField(max_length=16, default="zh-CN")

    if TYPE_CHECKING:
        workspace_id: UUID
        site_id: UUID
        primary_item_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "domain_content_translation_groups"
        abstract = False
