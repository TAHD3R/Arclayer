from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema


class WorkspacePluginSummary(BaseSchema):
    """
    Plugin summary used by workspace plugin center.

    Notes:
    - `status` reflects global plugin runtime status (PluginRecord.status).
    - `enabled` reflects workspace-level toggle.
    """

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True, validate_default=True)

    plugin_id: str = Field(..., description="Plugin identifier.")
    management_scope: str = Field(default="workspace", description="Plugin management scope.")
    slug: str | None = Field(default=None, description="Plugin slug used for routing.")
    name: str = Field(..., description="Plugin display name (localized if possible).")
    description: str | None = Field(default=None, description="Plugin description (localized if possible).")
    version: str = Field(..., description="Plugin version.")
    requires: str | None = Field(default=None, description="Host version requirement specifier.")
    author: str = Field(..., description="Plugin author.")
    license: str | None = Field(default=None, description="Plugin license.")
    status: str = Field(..., description="Global plugin status (installed/started/disabled/failed).")
    category: str | None = Field(default=None, description="Optional plugin category code.")
    has_config_schema: bool = Field(default=False, description="Whether plugin declares a config schema.")

    icon_url: str | None = Field(
        default=None,
        description="Optional plugin icon URL or API path (workspace-scoped) for rendering in admin UI.",
    )
    enabled: bool = Field(default=False, description="Whether the plugin is enabled in this workspace.")
    config: dict[str, Any] | None = Field(default=None, description="Workspace-scoped plugin config.")


class WorkspacePluginListOut(BaseSchema):
    items: list[WorkspacePluginSummary] = Field(default_factory=list, description="Workspace plugin list.")


class WorkspacePluginInstallResult(BaseSchema):
    plugin: WorkspacePluginSummary = Field(..., description="Installed plugin (workspace view).")
    requires_restart: bool = Field(..., description="Whether a server restart is required.")


class WorkspacePluginInstallRequest(BaseSchema):
    enable_in_workspace: bool = Field(default=True, description="Enable the plugin in current workspace after install.")


class WorkspacePluginConfigUpdate(BaseSchema):
    config: dict[str, Any] = Field(..., description="Workspace-scoped plugin config payload.")
