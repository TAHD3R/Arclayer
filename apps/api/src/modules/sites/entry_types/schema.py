from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID


class SiteEntryTypeOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Entry type id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    code: str = Field(..., description="Entry type code.")
    name: str = Field(..., description="Entry type display name.")
    fields_schema: dict[str, Any] | None = Field(default=None, description="Entry field schema (JSON).")


class SiteEntryTypeCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=64, description="Entry type code (e.g. blog_post).")
    name: str = Field(..., min_length=1, max_length=128, description="Entry type display name.")
    fields_schema: dict[str, Any] | None = Field(default=None, description="Entry field schema (JSON).")


class SiteEntryTypeUpdateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128, description="Entry type display name.")
    fields_schema: dict[str, Any] | None = Field(default=None, description="Entry field schema (JSON).")


class SiteEntryTypeDeleteOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    entry_type_id: PublicUUID = Field(..., description="Deleted entry type id.")
