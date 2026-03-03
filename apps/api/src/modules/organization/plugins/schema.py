from __future__ import annotations

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema


class OrganizationPluginSummary(BaseSchema):
    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True, validate_default=True)

    plugin_id: str = Field(..., description="Plugin identifier.")
    management_scope: str = Field(default="organization", description="Plugin management scope.")
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
    enabled: bool = Field(default=False, description="Whether the plugin is enabled in current organization.")


class OrganizationPluginListOut(BaseSchema):
    items: list[OrganizationPluginSummary] = Field(default_factory=list, description="Organization plugin list.")
