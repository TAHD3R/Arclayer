from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class OrganizationPluginState(BaseModel):
    """
    Organization-scoped plugin state.

    Notes:
    - Installation remains global (`PluginRecord`).
    - Organization state controls whether org-scoped capabilities are active.
    """

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="plugin_states",
        on_delete=fields.CASCADE,
    )
    plugin_id = fields.CharField(max_length=128, db_index=True)
    enabled = fields.BooleanField(default=False, db_index=True)

    class Meta(BaseModel.Meta):
        table = "organization_plugins"
        abstract = False
        unique_together = (("organization_id", "plugin_id"),)
