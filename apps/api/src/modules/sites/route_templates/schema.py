from __future__ import annotations

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID


class SiteRouteTemplateOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Route template id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    path_pattern: str = Field(..., description="Path pattern (e.g. /blog/:slug).")
    entry_type_id: PublicUUID = Field(..., description="Entry type id.")
    entry_type_code: str = Field(..., description="Entry type code (e.g. blog_post).")
    template_page_revision_id: PublicUUID | None = Field(
        default=None, description="Optional template page revision id used as layout skeleton."
    )
    is_active: bool = Field(default=True, description="Whether the template is active.")


class SiteRouteTemplateCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path_pattern: str = Field(..., description="Path pattern (e.g. /blog/:slug).", examples=["/blog/:slug"])
    entry_type_code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    template_page_revision_id: PublicUUID | None = Field(
        default=None, description="Optional template page revision id used as layout skeleton."
    )
    is_active: bool = Field(default=True, description="Whether the template is active.")


class SiteRouteTemplateUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    path_pattern: str | None = Field(default=None, description="Path pattern (e.g. /blog/:slug).")
    entry_type_code: str | None = Field(default=None, min_length=1, max_length=64, description="Entry type code.")
    template_page_revision_id: PublicUUID | None = Field(
        default=None, description="Optional template page revision id used as layout skeleton."
    )
    is_active: bool | None = Field(default=None, description="Whether the template is active.")


class SiteRouteTemplateDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    template_id: PublicUUID = Field(..., description="Deleted route template id.")
