from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import ConfigDict, Field

from apps.api.common.schemas import BaseSchema


class PluginPermissionItem(BaseSchema):
    code: str = Field(..., description="Permission code.")
    name: str | None = Field(default=None, description="Localized permission name.")
    description: str | None = Field(default=None, description="Localized permission description.")
    default_roles: list[str] = Field(default_factory=list, description="Default roles for this permission.")


class PluginConfigFieldItem(BaseSchema):
    key: str = Field(..., description="Config key.")
    type: str = Field(..., description="Config field type.")
    default: Any | None = Field(default=None, description="Default value.")
    secret: bool = Field(default=False, description="Whether this field is secret/sensitive.")
    options: list[PluginConfigOptionItem] = Field(default_factory=list, description="Optional select options.")
    ui: dict[str, Any] | None = Field(default=None, description="UI rendering hints (optional).")
    label: str | None = Field(default=None, description="Localized label.")
    description: str | None = Field(default=None, description="Localized description.")


class PluginConfigOptionItem(BaseSchema):
    value: Any = Field(..., description="Option value.")
    label: str | None = Field(default=None, description="Localized label.")
    description: str | None = Field(default=None, description="Localized description.")


class PluginConfigSectionItem(BaseSchema):
    id: str = Field(..., description="Section identifier.")
    title: str | None = Field(default=None, description="Localized title.")
    fields: list[PluginConfigFieldItem] = Field(default_factory=list, description="Config fields.")


class PluginConfigSchemaItem(BaseSchema):
    sections: list[PluginConfigSectionItem] = Field(default_factory=list, description="Config sections.")


class PluginDependencyItem(BaseSchema):
    plugin_id: str = Field(..., description="Dependency plugin identifier.")
    version: str | None = Field(default=None, description="Dependency version specifier (PEP 440).")
    optional: bool = Field(default=False, description="Whether this dependency is optional.")
    status: str = Field(..., description="Dependency status (ok/missing/disabled/version_mismatch/failed).")
    installed_version: str | None = Field(default=None, description="Installed dependency version if available.")
    detail: str | None = Field(default=None, description="Optional diagnostic detail.")


class PluginSummary(BaseSchema):
    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        validate_assignment=True,
        use_enum_values=True,
    )

    plugin_id: str = Field(..., description="Plugin identifier.")
    slug: str | None = Field(default=None, description="Plugin slug used for routing.")
    name: str = Field(..., description="Plugin name.")
    description: str | None = Field(default=None, description="Plugin description.")
    version: str = Field(..., description="Plugin version.")
    author: str = Field(..., description="Plugin author.")
    status: str = Field(..., description="Plugin status.")
    storage_path: str = Field(..., description="Plugin storage path.")
    created_at: datetime = Field(..., description="Record creation time.")
    updated_at: datetime = Field(..., description="Record update time.")


class PluginDetail(PluginSummary):
    requires: str = Field(..., description="Plugin required app version.")
    entrypoint: str = Field(..., description="Plugin entrypoint.")
    website: str | None = Field(default=None, description="Plugin website.")
    repository: str | None = Field(default=None, description="Plugin repository.")
    issues: str | None = Field(default=None, description="Plugin issues tracker.")
    license: str | None = Field(default=None, description="Plugin license.")
    started_at: datetime | None = Field(default=None, description="Plugin start time.")
    package_filename: str | None = Field(default=None, description="Installed package filename.")
    package_checksum: str | None = Field(default=None, description="Installed package checksum (sha256).")
    package_size: int | None = Field(default=None, description="Installed package size.")
    config_schema: PluginConfigSchemaItem | None = Field(default=None, description="Plugin config schema.")
    config: dict[str, Any] | None = Field(default=None, description="Plugin configuration.")
    permissions: list[PluginPermissionItem] | None = Field(default=None, description="Declared permissions.")
    dependencies: list[PluginDependencyItem] | None = Field(default=None, description="Declared dependencies.")


class PluginConfigUpdate(BaseSchema):
    config: dict[str, Any] = Field(..., description="Plugin configuration payload.")


class PluginInstallResult(BaseSchema):
    plugin: PluginDetail = Field(..., description="Installed plugin detail.")
    requires_restart: bool = Field(..., description="Whether a restart is required.")
