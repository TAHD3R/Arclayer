from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import ConfigDict, Field

from apps.api.common.schemas import BaseSchema


class PluginSummary(BaseSchema):
    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        validate_assignment=True,
        use_enum_values=True,
    )

    plugin_id: str = Field(..., description="Plugin identifier.")
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
    config_schema: dict[str, Any] | None = Field(default=None, description="Plugin config schema.")
    config: dict[str, Any] | None = Field(default=None, description="Plugin configuration.")
    permissions: list[dict[str, Any]] | None = Field(default=None, description="Declared permissions.")


class PluginConfigUpdate(BaseSchema):
    config: dict[str, Any] = Field(..., description="Plugin configuration payload.")


class PluginInstallResult(BaseSchema):
    plugin: PluginDetail = Field(..., description="Installed plugin detail.")
    requires_restart: bool = Field(..., description="Whether a restart is required.")
