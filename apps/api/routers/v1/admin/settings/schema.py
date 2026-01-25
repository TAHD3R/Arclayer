from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from apps.api.common.schemas import BaseSchema


class SettingsFieldItem(BaseSchema):
    key: str = Field(..., description="Config key.")
    type: str = Field(..., description="Config field type.")
    default: Any | None = Field(default=None, description="Default value.")
    secret: bool = Field(default=False, description="Whether this field is secret/sensitive.")
    ui: dict[str, Any] | None = Field(default=None, description="UI rendering hints (optional).")
    label: str | None = Field(default=None, description="Localized label.")
    description: str | None = Field(default=None, description="Localized description.")


class SettingsSectionItem(BaseSchema):
    id: str = Field(..., description="Section identifier.")
    title: str | None = Field(default=None, description="Localized title.")
    fields: list[SettingsFieldItem] = Field(default_factory=list, description="Section fields.")


class SettingsSchemaItem(BaseSchema):
    sections: list[SettingsSectionItem] = Field(default_factory=list, description="Config schema sections.")


class SettingsNamespaceSummary(BaseSchema):
    namespace: str = Field(..., description="Settings namespace.")
    kind: Literal["core", "theme", "plugin"] = Field(..., description="Namespace kind.")
    title: str = Field(..., description="Display title.")
    description: str | None = Field(default=None, description="Optional description.")
    plugin_id: str | None = Field(default=None, description="Plugin id if kind=plugin.")
    plugin_slug: str | None = Field(default=None, description="Plugin slug if kind=plugin.")


class SettingsDetail(BaseSchema):
    namespace: str = Field(..., description="Settings namespace.")
    schema: SettingsSchemaItem = Field(..., description="Schema for UI and validation.")
    value: dict[str, Any] = Field(default_factory=dict, description="Masked settings value.")
    secrets: dict[str, bool] = Field(default_factory=dict, description="Secret field set state by path.")
    updated_at: datetime | None = Field(default=None, description="Last update time.")


class SettingsPatch(BaseSchema):
    patch: dict[str, Any] = Field(default_factory=dict, description="Merge patch payload.")
