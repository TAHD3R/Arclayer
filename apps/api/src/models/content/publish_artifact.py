from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel
from src.models.content._enums import PublishArtifactKind


class PublishArtifactRecord(BaseModel):
    """Domain model for publish artifact records."""

    release = fields.ForeignKeyField(
        "models.ContentReleaseRecord",
        related_name="artifacts",
        on_delete=fields.CASCADE,
    )
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_publish_artifacts",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_publish_artifacts",
        on_delete=fields.CASCADE,
    )
    item = fields.ForeignKeyField(
        "models.ContentItemRecord",
        related_name="publish_artifacts",
        on_delete=fields.CASCADE,
    )
    version = fields.ForeignKeyField(
        "models.ContentVersionRecord",
        related_name="publish_artifacts",
        on_delete=fields.CASCADE,
    )
    artifact_kind = fields.CharEnumField(PublishArtifactKind, max_length=32, db_index=True)
    locale = fields.CharField(max_length=16, default="zh-CN", db_index=True)
    payload = fields.JSONField(null=True)
    html = fields.TextField(null=True)

    if TYPE_CHECKING:
        release_id: UUID
        workspace_id: UUID
        site_id: UUID
        item_id: UUID
        version_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_publish_artifacts"
        table_description = "Static publish artifact records generated per release."
        abstract = False
        unique_together = (("release_id", "site_id", "item_id", "version_id", "artifact_kind", "locale"),)
