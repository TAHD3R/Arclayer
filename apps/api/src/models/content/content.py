from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


# Content type definition (workspace + site scoped).
class ContentTypeRecord(BaseModel):
    """Content type definition scoped by workspace + site."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_types",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_types",
        on_delete=fields.CASCADE,
    )

    code = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    kind = fields.CharField(max_length=16, default="custom", db_index=True)

    field_schema = fields.JSONField(null=True)
    editor_schema = fields.JSONField(null=True)
    render_contract = fields.JSONField(null=True)
    workflow_policy = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "content_types"
        abstract = False
        unique_together = (("workspace_id", "site_id", "code"),)


# Content entry record (type + slug).
class ContentEntryRecord(BaseModel):
    """Content entry bound to a content type."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="content_entries",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="content_entries",
        on_delete=fields.CASCADE,
    )
    type = fields.ForeignKeyField(
        "models.ContentTypeRecord",
        related_name="entries",
        on_delete=fields.CASCADE,
    )

    slug = fields.CharField(max_length=256, db_index=True)
    title = fields.CharField(max_length=256, null=True)
    status = fields.CharField(max_length=16, default="draft", db_index=True)
    visibility = fields.CharField(max_length=16, default="public")
    locale = fields.CharField(max_length=16, default="zh-CN")

    field_values = fields.JSONField(null=True)

    draft_revision = fields.IntField(default=0)
    published_revision = fields.IntField(null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "content_entries"
        abstract = False
        unique_together = (("type_id", "slug"),)


# Content revision snapshot (immutable).
class ContentRevisionRecord(BaseModel):
    """Immutable revision snapshots for a content entry."""

    entry = fields.ForeignKeyField(
        "models.ContentEntryRecord",
        related_name="revisions",
        on_delete=fields.CASCADE,
    )

    revision = fields.IntField()
    snapshot = fields.JSONField()
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "content_revisions"
        abstract = False
        unique_together = (("entry_id", "revision"),)
