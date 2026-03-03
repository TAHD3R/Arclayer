from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class EntryTypeRecord(BaseModel):
    """
    Entry type schema (e.g. blog_post).

    Sprint 3:
    - Keep the schema payload flexible as JSON for now.
      Future: validate against a strict field type system + UI form metadata.
    """

    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="entry_types",
        on_delete=fields.CASCADE,
    )

    code = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)

    fields_schema = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "entry_types"
        abstract = False
        unique_together = (("site_id", "code"),)


class EntryRecord(BaseModel):
    """Entry instance (e.g. a blog post identified by slug)."""

    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="entries",
        on_delete=fields.CASCADE,
    )

    entry_type = fields.ForeignKeyField(
        "models.EntryTypeRecord",
        related_name="entries",
        on_delete=fields.CASCADE,
    )

    slug = fields.CharField(max_length=256, db_index=True)

    draft_rev = fields.IntField(default=0)
    published_rev = fields.IntField(null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "entries"
        abstract = False
        unique_together = (("entry_type_id", "slug"),)


class EntryRevisionRecord(BaseModel):
    """Immutable entry revision snapshot (data/document + metadata/style/deps)."""

    entry = fields.ForeignKeyField(
        "models.EntryRecord",
        related_name="revisions",
        on_delete=fields.CASCADE,
    )

    rev = fields.IntField()

    data = fields.JSONField(null=True)
    # Legacy page document payload（已废弃）。
    document = fields.JSONField(null=True)
    # PageBlueprint payload（新真相源）。
    design_document = fields.JSONField(null=True)

    # M2: layered revision payload (nullable for backward compatibility).
    meta = fields.JSONField(null=True)
    style_overrides = fields.JSONField(null=True)
    variant_id = fields.CharField(max_length=128, null=True)
    deps = fields.JSONField(null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "entry_revisions"
        abstract = False
        unique_together = (("entry_id", "rev"),)
