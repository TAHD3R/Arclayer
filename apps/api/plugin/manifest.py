from __future__ import annotations

from pathlib import Path
from typing import Any

import tomllib
from pydantic import Field, field_validator

from apps.api.common.constants.plugin import PLUGIN_CATEGORY_CODES
from apps.api.common.schemas import BaseSchema


class PluginDependency(BaseSchema):
    id: str = Field(..., description="Dependency plugin identifier.")
    version: str | None = Field(default=None, description="Dependency version specifier (PEP 440).")
    optional: bool = Field(default=False, description="Whether this dependency is optional.")


class PermissionTemplate(BaseSchema):
    code: str
    scope: str = "workspace"
    name: str
    description: str | None = None
    name_i18n: str | None = None
    description_i18n: str | None = None
    default_roles: list[str] = Field(default_factory=list)


class ConfigOption(BaseSchema):
    value: Any = Field(..., description="Option value.")
    label: str | None = Field(default=None, description="Option label.")
    description: str | None = Field(default=None, description="Option description.")
    label_i18n: str | None = Field(default=None, description="i18n ref for label.")
    description_i18n: str | None = Field(default=None, description="i18n ref for description.")


class ConfigField(BaseSchema):
    key: str
    type: str
    default: Any | None = None
    secret: bool = False
    ui: dict[str, Any] | None = None
    options: list[ConfigOption] = Field(default_factory=list, description="Optional select options for UI.")
    label: str | None = None
    description: str | None = None
    label_i18n: str | None = None
    description_i18n: str | None = None


class ConfigSection(BaseSchema):
    id: str
    title: str
    title_i18n: str | None = None
    fields: list[ConfigField] = Field(default_factory=list)


class ConfigSchema(BaseSchema):
    sections: list[ConfigSection] = Field(default_factory=list)


class PluginMeta(BaseSchema):
    management_scope: str = Field(
        default="workspace",
        description="Plugin management scope (workspace/organization).",
    )
    id: str = Field(
        ...,
        description="Plugin identifier (used for installation directory name and DB primary identifier).",
        max_length=128,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    slug: str = Field(
        ...,
        description="Plugin URL slug used for routing (lowercase, kebab-case).",
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    category: str | None = Field(
        default=None,
        description="Optional plugin category code (used by admin plugin center filtering).",
    )
    icon: str | None = Field(
        default=None,
        description="Optional plugin icon path (relative to plugin root) or an absolute URL.",
    )
    name: str
    description: str | None = None
    name_i18n: str | None = None
    description_i18n: str | None = None
    author: str
    version: str
    requires: str
    entrypoint: str
    website: str | None = None
    repository: str | None = None
    issues: str | None = None
    license: str | None = None

    @field_validator("id", mode="after")
    @classmethod
    def _validate_id(cls, value: str) -> str:
        trimmed = (value or "").strip()
        # Keep reserved names out of the plugin namespace. These could conflict with
        # internal directories under PLUGIN__ROOT_DIR (e.g. ".staging", ".backup") or core ids.
        reserved = {"core", ".staging", ".backup", ".cache"}
        if trimmed in reserved:
            # Use a stable marker string so callers can map this to a dedicated API error code.
            raise ValueError("PLUGIN_ID_RESERVED")
        return trimmed

    @field_validator("category", mode="after")
    @classmethod
    def _validate_category(cls, value: str | None) -> str | None:
        trimmed = (value or "").strip().lower()
        if not trimmed:
            return None
        if trimmed not in PLUGIN_CATEGORY_CODES:
            raise ValueError("PLUGIN_CATEGORY_INVALID")
        return trimmed

    @field_validator("management_scope", mode="after")
    @classmethod
    def _validate_management_scope(cls, value: str) -> str:
        scope = (value or "").strip().lower()
        if not scope:
            return "workspace"
        if scope not in {"workspace", "organization"}:
            raise ValueError("PLUGIN_SCOPE_INVALID")
        return scope


class PluginManifest(BaseSchema):
    plugin: PluginMeta
    dependencies: list[PluginDependency] = Field(default_factory=list)
    permissions: list[PermissionTemplate] = Field(default_factory=list)
    config_schema: ConfigSchema | None = None
    models: list[str] = Field(default_factory=list)
    admin_menu: list[AdminMenuSeedItem] = Field(default_factory=list)
    admin_ui_extensions: list[AdminUIExtensionDecl] = Field(default_factory=list)
    portal_extensions: list[PortalExtensionDecl] = Field(default_factory=list)


class AdminMenuSeedItem(BaseSchema):
    code: str
    parent_code: str | None = None
    title: str
    title_i18n: str | None = None
    icon: str | None = None
    type: str = "item"
    path: str | None = None
    name: str | None = None
    component_key: str | None = None
    redirect: str | None = None
    sort: int = 0
    is_active: bool = True
    permission_code: str | None = None
    meta: dict[str, Any] | None = None


class AdminUIExtensionDecl(BaseSchema):
    id: str
    slot: str
    title: str
    title_i18n: str | None = None
    kind: str = "action"
    icon: str | None = None
    permission_code: str | None = None
    meta: dict[str, Any] | None = None


class PortalExtensionDecl(BaseSchema):
    id: str
    kind: str
    title: str
    title_i18n: str | None = None
    permission_code: str | None = None
    meta: dict[str, Any] | None = None


def load_plugin_manifest(path: Path) -> PluginManifest:
    payload = tomllib.loads(path.read_text(encoding="utf-8"))
    return PluginManifest.model_validate(payload)


def build_default_config(manifest: PluginManifest) -> dict[str, Any]:
    schema = manifest.config_schema
    if not schema:
        return {}

    config: dict[str, Any] = {}
    for section in schema.sections:
        section_values: dict[str, Any] = {}
        for field in section.fields:
            if field.default is not None:
                section_values[field.key] = field.default
        if section_values:
            config[section.id] = section_values
    return config


# Ensure forward refs are resolved (Pydantic v2).
PluginManifest.model_rebuild()
