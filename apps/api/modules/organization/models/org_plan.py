from __future__ import annotations

from tortoise import fields

from apps.api.common.models.base import BaseModel


class OrgPlan(BaseModel):
    """
    Organization billing plan / quota record.

    Each organization has at most one active plan row. The plan_code maps to
    a product catalog entry managed outside the DB (Stripe, internal config, etc.).
    """

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="plans",
        on_delete=fields.CASCADE,
    )

    plan_code = fields.CharField(max_length=64, default="free", db_index=True)
    page_limit = fields.IntField(default=20)
    storage_limit_mb = fields.IntField(default=500)
    custom_domain_enabled = fields.BooleanField(default=False)
    is_active = fields.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "org_plans"
        abstract = False
