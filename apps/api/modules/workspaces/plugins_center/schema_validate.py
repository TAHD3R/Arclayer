from __future__ import annotations

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class PluginPackageMeta(BaseSchema):
    plugin_id: str = Field(..., description="Plugin identifier declared by the package.")
    slug: str = Field(..., description="Plugin slug declared by the package.")
    name: str = Field(..., description="Display name (localized if possible).")
    description: str | None = Field(default=None, description="Description (localized if possible).")
    author: str = Field(..., description="Plugin author.")
    version: str = Field(..., description="Plugin version.")
    requires: str = Field(..., description="Required host app version spec.")
    category: str | None = Field(default=None, description="Optional plugin category code.")
    icon: str | None = Field(default=None, description="Optional raw icon reference from manifest.")

    has_config_schema: bool = Field(..., description="Whether the package declares a config schema.")
    permissions_count: int = Field(..., description="Number of declared permissions.")
    models_count: int = Field(..., description="Number of declared model modules.")


class WorkspacePluginPackageValidateOut(BaseSchema):
    token: str = Field(..., description="Short-lived validation token used for confirm install.")
    sha256: str = Field(..., description="SHA256 checksum of the uploaded zip.")
    size_bytes: int = Field(..., description="Uploaded zip size in bytes.")
    meta: PluginPackageMeta = Field(..., description="Plugin metadata for confirmation UI.")


class WorkspacePluginInstallValidatedIn(BaseSchema):
    token: str = Field(..., min_length=16, max_length=128, description="Validation token.")
    enable_in_workspace: bool = Field(default=True, description="Enable in workspace after install.")
