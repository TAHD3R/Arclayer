from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


class OrganizationCapabilityState(BaseModel):
    """
    Organization-scoped capability enablement state.

    Notes:
    - Capability ids are declared by app manifests.
    - Core runtime enforces scope semantics; third-party providers must not run DB migrations in-process.
    """

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="capability_states",
        on_delete=fields.CASCADE,
    )
    capability_id = fields.CharField(max_length=128, db_index=True)
    enabled = fields.BooleanField(default=False, db_index=True)
    config = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "organization_capabilities"
        abstract = False
        unique_together = (("organization_id", "capability_id"),)
