from __future__ import annotations

from tortoise import fields

from src.common.models import BaseModel


class WorkspaceCapabilityState(BaseModel):
    """Domain model for workspace capability states.

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
        table = "domain_workspace_capabilities"
        abstract = False
        unique_together = (("workspace_id", "capability_id"),)
