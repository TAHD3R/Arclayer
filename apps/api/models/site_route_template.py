from __future__ import annotations

from tortoise import fields

from apps.api.models.base import BaseModel


class RouteTemplateRecord(BaseModel):
    """
    Dynamic route template binding (e.g. /blog/:slug -> blog_post entries).

    Sprint 3:
    - Only support single-segment parameters like `:slug`.
    - Template page revision is optional; when present, it can be used as a layout skeleton.
    """

    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="route_templates",
        on_delete=fields.CASCADE,
    )

    path_pattern = fields.CharField(max_length=256, db_index=True)

    entry_type = fields.ForeignKeyField(
        "models.EntryTypeRecord",
        related_name="route_templates",
        on_delete=fields.CASCADE,
    )

    template_page_revision = fields.ForeignKeyField(
        "models.SitePageRevisionRecord",
        related_name="as_route_template_skeleton",
        null=True,
        on_delete=fields.SET_NULL,
    )

    is_active = fields.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "route_templates"
        abstract = False
        unique_together = (("site_id", "path_pattern"),)

