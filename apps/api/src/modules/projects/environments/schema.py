from __future__ import annotations

from pydantic import ConfigDict, Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID


class ProjectEnvironmentOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    project_id: PublicUUID = Field(..., description="Project id.")
    key: str = Field(..., description="Environment key.")
    name: str = Field(..., description="Environment name.")
    is_production: bool = Field(..., alias="isProduction", description="Whether this is the production environment.")
    is_default_preview: bool = Field(
        ...,
        alias="isDefaultPreview",
        description="Whether this environment is the default preview target.",
    )
    created_by_user_id: PublicUUID | None = Field(default=None, description="Actor that created the environment.")


class ProjectEnvironmentListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ProjectEnvironmentOut] = Field(default_factory=list, description="Project environments.")


class ProjectEnvironmentPatchIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=64, description="Environment display name.")
    is_default_preview: bool | None = Field(
        default=None,
        alias="isDefaultPreview",
        description="Whether this environment should back preview contracts.",
    )
