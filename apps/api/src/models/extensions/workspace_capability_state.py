from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


class WorkspaceCapabilityState(BaseModel):
    """
    Workspace-scoped capability enablement state.

    Design:
    - App is installed globally (ExtensionApp).
    - Workspace decides which capabilities are enabled and what overrides to apply.
    """

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="capability_states",
        on_delete=fields.CASCADE,
    )
    capability_id = fields.CharField(max_length=128, db_index=True)
    enabled = fields.BooleanField(default=False, db_index=True)
    config = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "workspace_capabilities"
        abstract = False
        unique_together = (("workspace_id", "capability_id"),)
