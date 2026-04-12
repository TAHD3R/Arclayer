from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.sites.design.schema import PageBlueprintFragment


class SitePatternOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", from_attributes=True)

    id: PublicUUID = Field(..., description="Pattern id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    code: str = Field(..., description="Pattern code (unique within site).")
    label: dict[str, str] = Field(
        default_factory=dict,
        validation_alias="label_json",
        description="Localized label map.",
    )
    category: str = Field(..., description="Pattern category.")
    preview_image_url: str | None = Field(default=None, description="Preview image URL.")
    page_blueprint_fragment: PageBlueprintFragment = Field(
        default_factory=lambda: PageBlueprintFragment(version=1),
        validation_alias="page_blueprint_fragment_json",
        description="Reusable PageBlueprint fragment (serialized JSON).",
    )
    created_at_ms: int = Field(
        ..., validation_alias="created_at", description="Created timestamp in milliseconds (UTC)."
    )

    @field_validator("created_at_ms", mode="before")
    @classmethod
    def _dt_to_ms(cls, v: datetime | int) -> int:
        if isinstance(v, datetime):
            return int(v.timestamp() * 1000)
        return v


class SitePatternCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=128, description="Pattern code (unique within site).")
    label: dict[str, str] = Field(default_factory=dict, description="Localized label map.")
    category: str = Field(default="custom", max_length=64, description="Pattern category.")
    preview_image_url: str | None = Field(default=None, max_length=512, description="Preview image URL.")
    page_blueprint_fragment: PageBlueprintFragment = Field(
        default_factory=lambda: PageBlueprintFragment(version=1),
        description="Reusable PageBlueprint fragment (serialized JSON).",
    )


class SitePatternUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    label: dict[str, str] | None = Field(default=None, description="Localized label map.")
    category: str | None = Field(default=None, max_length=64, description="Pattern category.")
    preview_image_url: str | None = Field(default=None, max_length=512, description="Preview image URL.")
    page_blueprint_fragment: PageBlueprintFragment | None = Field(
        default=None,
        description="Reusable PageBlueprint fragment (serialized JSON).",
    )


class SitePatternDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    pattern_id: PublicUUID = Field(..., description="Deleted pattern id.")
