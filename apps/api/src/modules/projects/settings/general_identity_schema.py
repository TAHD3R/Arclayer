from __future__ import annotations

from typing import Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.models.workspaces.workspace import WorkspaceIconMode


class ProjectGeneralIdentity(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=256)
    icon_mode: WorkspaceIconMode = WorkspaceIconMode.INITIALS
    icon_color: str = Field(default="#337ea9", min_length=4, max_length=7)
    icon_glyph: str | None = Field(default=None, max_length=64)
    icon_emoji: str | None = Field(default=None, max_length=32)
    icon_url: str | None = Field(default=None, max_length=1024)

    @field_validator("description", "icon_glyph", "icon_emoji", "icon_url", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("icon_color", mode="before")
    @classmethod
    def normalize_icon_color(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip().lower()
        if len(normalized) == 4 and normalized.startswith("#"):
            normalized = "#" + "".join(char * 2 for char in normalized[1:])
        if len(normalized) != 7 or not normalized.startswith("#"):
            raise ValueError("icon color must be a six-digit hex color")
        if any(char not in "0123456789abcdef" for char in normalized[1:]):
            raise ValueError("icon color must be a six-digit hex color")
        return normalized

    @model_validator(mode="after")
    def require_active_icon_value(self) -> Self:
        active_value = {
            WorkspaceIconMode.GLYPH: self.icon_glyph,
            WorkspaceIconMode.EMOJI: self.icon_emoji,
            WorkspaceIconMode.IMAGE: self.icon_url,
        }.get(WorkspaceIconMode(self.icon_mode))
        if self.icon_mode != WorkspaceIconMode.INITIALS and active_value is None:
            raise ValueError(f"{self.icon_mode} icon mode requires its active value")

        inactive_values = {
            WorkspaceIconMode.GLYPH: (self.icon_emoji, self.icon_url),
            WorkspaceIconMode.EMOJI: (self.icon_glyph, self.icon_url),
            WorkspaceIconMode.IMAGE: (self.icon_glyph, self.icon_emoji),
            WorkspaceIconMode.INITIALS: (self.icon_glyph, self.icon_emoji, self.icon_url),
        }[WorkspaceIconMode(self.icon_mode)]
        if any(value is not None for value in inactive_values):
            raise ValueError("inactive icon values must be null")
        return self


class ProjectGeneralIdentityDetail(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    value: ProjectGeneralIdentity
    etag: str = Field(min_length=1)
