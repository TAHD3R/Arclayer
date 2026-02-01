from __future__ import annotations

from pathlib import Path
from typing import Any

import tomllib
from pydantic import Field

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


class ConfigField(BaseSchema):
    key: str
    type: str
    default: Any | None = None
    secret: bool = False
    ui: dict[str, Any] | None = None
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
    id: str
    slug: str = Field(
        ...,
        description="Plugin URL slug used for routing (lowercase, kebab-case).",
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
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


class PluginManifest(BaseSchema):
    plugin: PluginMeta
    dependencies: list[PluginDependency] = Field(default_factory=list)
    permissions: list[PermissionTemplate] = Field(default_factory=list)
    config_schema: ConfigSchema | None = None
    models: list[str] = Field(default_factory=list)


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
