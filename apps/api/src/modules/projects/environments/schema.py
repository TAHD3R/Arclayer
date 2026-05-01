from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID


class ProjectEnvironmentOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    created_at: datetime = Field(..., alias="createdAt", description="Created at.")
    updated_at: datetime = Field(..., alias="updatedAt", description="Updated at.")
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


class ProjectEnvironmentAliasOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    created_at: datetime = Field(..., alias="createdAt", description="Created at.")
    updated_at: datetime = Field(..., alias="updatedAt", description="Updated at.")
    project_id: PublicUUID = Field(..., description="Project id.")
    key: str = Field(..., description="Alias key.")
    name: str = Field(..., description="Alias display name.")
    target_environment_id: PublicUUID = Field(..., alias="targetEnvironmentId", description="Target environment id.")
    target_environment_key: str = Field(..., alias="targetEnvironmentKey", description="Target environment key.")
    target_environment_name: str = Field(..., alias="targetEnvironmentName", description="Target environment name.")
    created_by_user_id: PublicUUID | None = Field(default=None, description="Actor that created the alias.")
    switched_by_user_id: PublicUUID | None = Field(default=None, description="Actor that last switched the alias.")
    switched_at: datetime | None = Field(default=None, alias="switchedAt", description="Alias switch timestamp.")


class ProjectEnvironmentListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ProjectEnvironmentOut] = Field(default_factory=list, description="Project environments.")
    aliases: list[ProjectEnvironmentAliasOut] = Field(default_factory=list, description="Project environment aliases.")


class ProjectEnvironmentPatchIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=64, description="Environment display name.")
    is_default_preview: bool | None = Field(
        default=None,
        alias="isDefaultPreview",
        description="Whether this environment should back preview contracts.",
    )


class ProjectEnvironmentAliasSwitchIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    target_environment_id: PublicUUID | None = Field(
        default=None,
        alias="targetEnvironmentId",
        description="Environment id to target.",
    )
    target_environment_key: str | None = Field(
        default=None,
        alias="targetEnvironmentKey",
        min_length=1,
        max_length=64,
        description="Environment key to target.",
    )


class ProjectEnvironmentCloneIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    source: str = Field(..., min_length=1, max_length=64, description="Source environment key, id, or alias.")
    target: str = Field(..., min_length=1, max_length=64, description="Target environment key or id.")
    include_content: bool = Field(default=True, alias="includeContent", description="Whether to clone content items.")


class ProjectEnvironmentPromoteIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    source: str = Field(..., min_length=1, max_length=64, description="Source environment key, id, or alias.")
    target: str = Field(..., min_length=1, max_length=64, description="Target environment key or id.")
    include_content: bool = Field(default=True, alias="includeContent", description="Whether to promote content items.")


class ProjectEnvironmentCopyOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    source_environment_id: PublicUUID = Field(..., alias="sourceEnvironmentId", description="Source environment id.")
    target_environment_id: PublicUUID = Field(..., alias="targetEnvironmentId", description="Target environment id.")
    content_models: int = Field(..., alias="contentModels", ge=0, description="Copied content model count.")
    content_items: int = Field(..., alias="contentItems", ge=0, description="Copied content item count.")
    content_versions: int = Field(..., alias="contentVersions", ge=0, description="Copied content version count.")
    route_bindings: int = Field(default=0, alias="routeBindings", ge=0, description="Copied route binding count.")
    releases: int = Field(default=0, ge=0, description="Copied release count.")
