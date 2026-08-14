from __future__ import annotations

from pydantic import ConfigDict, Field, ValidationError, field_validator

from src.common.schemas import BaseSchema
from src.modules.workspaces.skills.manifest import (
    SkillDataEgressDeclarationV1,
    SkillPermissionDeclarationV1,
    SkillToolRequirementV1,
)


class SkillPackageMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    slug: str = Field(min_length=1, max_length=96)
    display_name: str = Field(min_length=1, max_length=128)
    description: str = Field(min_length=1, max_length=1000)
    semantic_version: str | None = Field(default=None, min_length=1, max_length=64)
    required_tools: tuple[SkillToolRequirementV1, ...] = Field(default_factory=tuple, max_length=128)
    permissions: tuple[SkillPermissionDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    data_egress: tuple[SkillDataEgressDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    capability_tags: tuple[str, ...] = Field(default_factory=tuple, max_length=128)

    @field_validator("slug")
    @classmethod
    def _validate_slug(cls, value: str) -> str:
        from src.modules.workspaces.skills.manifest import normalize_skill_slug

        normalized = normalize_skill_slug(value)
        if normalized != value:
            raise ValueError("Skill slug must already be normalized")
        return value


def parse_skill_package_metadata(content: bytes) -> SkillPackageMetadata:
    try:
        return SkillPackageMetadata.model_validate_json(content)
    except ValidationError as exc:
        raise ValueError("skill.json does not satisfy the Skill package metadata contract") from exc
