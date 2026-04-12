from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema


class SiteSettingGetOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    namespace: str = Field(..., description="Setting namespace.")
    value: dict[str, Any] | None = Field(default=None, description="Setting value (JSON).")


class SiteSettingUpsertIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    value: dict[str, Any] | None = Field(default=None, description="Setting value (JSON).")


class SiteStyleOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    namespace: str = Field(..., description="Style setting namespace.")
    value: dict[str, Any] | None = Field(default=None, description="Site style payload (JSON).")


class SiteStyleUpsertIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    value: dict[str, Any] | None = Field(default=None, description="Site style payload (JSON).")


class SiteGlobalSectionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=128, description="Global section id.")
    name: str = Field(..., min_length=1, max_length=128, description="Global section display name.")
    kind: str = Field(..., min_length=1, max_length=64, description="Global section kind key.")
    enabled: bool = Field(default=True, description="Whether this global section is enabled.")
    payload: dict[str, Any] | None = Field(default=None, description="Global section payload (JSON).")
    updated_at_ms: int = Field(..., ge=0, description="Last update timestamp in milliseconds (UTC).")


class SiteGlobalSectionsOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[SiteGlobalSectionOut] = Field(default_factory=list, description="Global sections.")


class SiteGlobalSectionCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=128, description="Global section display name.")
    kind: str = Field(..., min_length=1, max_length=64, description="Global section kind key.")
    enabled: bool = Field(default=True, description="Whether this global section is enabled.")
    payload: dict[str, Any] | None = Field(default=None, description="Global section payload (JSON).")


class SiteGlobalSectionUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128, description="Global section display name.")
    kind: str | None = Field(default=None, min_length=1, max_length=64, description="Global section kind key.")
    enabled: bool | None = Field(default=None, description="Whether this global section is enabled.")
    payload: dict[str, Any] | None = Field(default=None, description="Global section payload (JSON).")


class SiteGlobalSectionDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=128, description="Deleted global section id.")
