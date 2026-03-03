from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID
from apps.api.src.modules.sites.design_document.schema import PageBlueprint


class SiteRouteDraftSaveIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path: str = Field(..., description="Route pathname to save (e.g. /about).", examples=["/about"])
    page_blueprint: PageBlueprint = Field(
        ...,
        alias="pageBlueprint",
        description="Draft PageBlueprint payload.",
    )
    meta: dict[str, Any] | None = Field(default=None, description="Optional metadata payload (JSON).")
    style_overrides: dict[str, Any] | None = Field(default=None, description="Optional style overrides payload (JSON).")
    variant_id: str | None = Field(default=None, description="Optional theme variant id.")
    deps: dict[str, Any] | None = Field(default=None, description="Optional dependency snapshot payload (JSON).")
    expected_revision: int | None = Field(
        default=None,
        ge=0,
        description="Optional optimistic lock revision. If provided, must match current draft revision.",
        examples=[0],
    )


class SiteRouteDraftSaveOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    path: str = Field(..., description="Saved pathname.")
    revision: int = Field(..., ge=1, description="Draft revision number.")
    saved_at_ms: int = Field(..., description="Saved timestamp in milliseconds (UTC).")


class SiteRoutePublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path: str = Field(..., description="Route pathname to publish (e.g. /about).", examples=["/about"])
    revision: int | None = Field(
        default=None,
        ge=1,
        description="Draft revision number to publish. If omitted, publish the latest draft revision.",
        examples=[1],
    )


class SiteRoutePublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    site_id: PublicUUID = Field(..., description="Site id.")
    path: str = Field(..., description="Published pathname.")
    revision: int = Field(..., ge=1, description="Published revision number.")
    published_at_ms: int = Field(..., description="Published timestamp in milliseconds (UTC).")
