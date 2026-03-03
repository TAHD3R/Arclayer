from __future__ import annotations

from tortoise import fields

from apps.api.src.common.models.base import BaseModel


# Workspace plugin enable state.
class WorkspacePluginState(BaseModel):
    """
    Workspace-scoped plugin state.

    Design:
    - Plugin code/package is installed globally (PluginRecord).
    - Workspace decides whether the plugin is enabled and what config to use.
    """

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="plugin_states",
        on_delete=fields.CASCADE,
    )
    plugin_id = fields.CharField(max_length=128, db_index=True)
    enabled = fields.BooleanField(default=False, db_index=True)
    config = fields.JSONField(null=True)

    class Meta(BaseModel.Meta):
        table = "workspace_plugins"
        abstract = False
        unique_together = (("workspace_id", "plugin_id"),)
