from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class SEOProfileRecord(BaseModel):
    """Immutable SEO profile persisted alongside a content version."""

    version = fields.OneToOneField(
        "models.ContentVersionRecord",
        related_name="seo_profile",
        on_delete=fields.CASCADE,
    )
    meta_title = fields.CharField(max_length=256, null=True)
    meta_description = fields.CharField(max_length=512, null=True)
    canonical_url = fields.CharField(max_length=1024, null=True)
    robots_directive = fields.CharField(max_length=128, null=True)
    payload = fields.JSONField(null=True)

    if TYPE_CHECKING:
        version_id: UUID

    class Meta(BaseModel.Meta):
        table = "content_seo_profiles"
        abstract = False
