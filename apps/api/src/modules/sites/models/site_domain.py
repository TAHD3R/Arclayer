from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class SiteDomainRecord(BaseModel):
    """
    Custom domain binding for a site (SaaS mode only).

    Resolution contract (used by SiteResolverMiddleware):
    - A hostname is routable only when `is_verified` and `is_active` are both true.
    - Verification is performed via a DNS TXT record containing `verification_token`.
    """

    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="domains",
        on_delete=fields.CASCADE,
    )

    hostname = fields.CharField(max_length=253, unique=True, db_index=True)

    is_verified = fields.BooleanField(default=False, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)

    verification_token = fields.CharField(max_length=128)
    verified_at = fields.DatetimeField(null=True)

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "site_domains"
        abstract = False
