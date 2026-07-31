from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


# Organization (tenant boundary).
class Organization(BaseModel):
    """Domain model for organizations.

    Organization (account-level container).

    Boundary model:
    - Organization groups workspaces and organization-level governance.
    - Workspace is the project/site governance boundary and the sole commercial tenant.
    - Plans, subscriptions, credits, entitlements, and usage never belong to or inherit from Organization.
    """

    slug = fields.CharField(max_length=64, unique=True, db_index=True)
    name = fields.CharField(max_length=128)
    owner_user_id = fields.UUIDField(null=True, unique=True)
    logo_url = fields.CharField(max_length=512, null=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    deleted_at = fields.DatetimeField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "organizations"
        table_description = "Organization tenant boundaries for organization-level governance."
        abstract = False
