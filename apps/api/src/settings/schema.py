from __future__ import annotations

from typing import Any

from pydantic import Field

from apps.api.src.common.schemas import BaseSchema


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
