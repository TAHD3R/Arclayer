from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from apps.api.models.base import BaseModel


class SitePageVisibility(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"


class SitePageRecord(BaseModel):
    """
    A site page identified by a unique path (per site).

    Revisions:
    - `draft_rev`: latest saved revision number (monotonic).
    - `published_rev`: revision number visible to public mode.

    We keep the revision pointers on the page record for fast resolution and to
    avoid scanning revisions on every SSR request.
    """

    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="pages",
        on_delete=fields.CASCADE,
    )

    path = fields.CharField(max_length=512, db_index=True)

    parent = fields.ForeignKeyField(
        "models.SitePageRecord",
        related_name="children",
        null=True,
        on_delete=fields.SET_NULL,
    )
    sort_order = fields.IntField(default=0)
    visibility = fields.CharEnumField(SitePageVisibility, default=SitePageVisibility.PUBLIC, db_index=True)

    draft_rev = fields.IntField(default=0)
    published_rev = fields.IntField(null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "site_pages"
        abstract = False
        unique_together = (("site_id", "path"),)


class SitePageRevisionRecord(BaseModel):
    """Immutable page revision snapshot (DocumentIR + metadata/style/deps)."""

    page = fields.ForeignKeyField(
        "models.SitePageRecord",
        related_name="revisions",
        on_delete=fields.CASCADE,
    )

    rev = fields.IntField()
    document = fields.JSONField()

    # M2: layered revision payload (nullable for backward compatibility).
    meta = fields.JSONField(null=True)
    style_overrides = fields.JSONField(null=True)
    variant_id = fields.CharField(max_length=128, null=True)
    deps = fields.JSONField(null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "site_page_revisions"
        abstract = False
        unique_together = (("page_id", "rev"),)
