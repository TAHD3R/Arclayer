from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class PermissionTemplate(BaseModel):
    code: str
    name: str
    description: str | None = None
    name_i18n: str | None = None
    description_i18n: str | None = None
    default_roles: list[str] = Field(default_factory=list)


class ConfigField(BaseModel):
    key: str
    type: str
    default: Any | None = None
    label: str | None = None
    description: str | None = None
    label_i18n: str | None = None
    description_i18n: str | None = None


class ConfigSection(BaseModel):
    id: str
    title: str
    title_i18n: str | None = None
    fields: list[ConfigField] = Field(default_factory=list)


class ConfigSchema(BaseModel):
    sections: list[ConfigSection] = Field(default_factory=list)


class PluginMeta(BaseModel):
    id: str
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


class PluginManifest(BaseModel):
    plugin: PluginMeta
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
