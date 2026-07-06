from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.common.schemas.base import BaseSchema
from src.common.types.public_uuid import PublicUUID

ProjectSourceFramework = Literal["react_vite", "astro"]
ProjectSourceProvider = Literal["managed", "git"]
ProjectSourcePackageManager = Literal["pnpm", "npm"]
ProjectSourceArtifactStrategy = Literal["object_storage", "container_image"]
ProjectSourceKind = Literal["generated_scaffold", "managed_source"]
ProjectSourceFileRole = Literal["config", "entry", "runtime", "content", "style", "types", "source"]


class ProjectSourceFileOut(BaseSchema):
    model_config = ConfigDict(
        str_strip_whitespace=False,
        validate_assignment=True,
        use_enum_values=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    path: str = Field(..., min_length=1, description="Project-relative source file path.")
    role: ProjectSourceFileRole = Field(..., description="File role in the generated project scaffold.")
    language: str = Field(..., min_length=1, description="Editor language id.")
    contents: str = Field(..., description="UTF-8 source file contents.")


class ProjectSourceManifestOut(BaseSchema):
    project_id: PublicUUID = Field(..., description="Project id.")
    source_kind: ProjectSourceKind = Field(
        default="generated_scaffold",
        description="Current source materialization kind. Generated scaffold is deterministic and not yet a persisted Git tree.",
    )
    framework: ProjectSourceFramework = Field(..., description="Configured project framework.")
    source_provider: ProjectSourceProvider = Field(..., description="Configured source provider.")
    package_manager: ProjectSourcePackageManager = Field(..., description="Configured package manager.")
    root_directory: str = Field(..., description="Configured project root directory.")
    build_command: str = Field(..., description="Configured build command.")
    output_directory: str = Field(..., description="Configured build output directory.")
    artifact_strategy: ProjectSourceArtifactStrategy = Field(
        ..., description="Configured deployment artifact strategy."
    )
    files: list[ProjectSourceFileOut] = Field(
        default_factory=list,
        description="Readable scaffold files derived from project metadata and source settings.",
    )


class ProjectSourceFileUpsertIn(BaseSchema):
    model_config = ConfigDict(
        str_strip_whitespace=False,
        validate_assignment=True,
        use_enum_values=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    role: ProjectSourceFileRole | None = Field(default=None, description="Optional source file role override.")
    language: str | None = Field(default=None, min_length=1, description="Optional editor language id override.")
    contents: str = Field(..., description="UTF-8 source file contents.")


class ProjectSourceFileDeleteOut(BaseSchema):
    project_id: PublicUUID = Field(..., description="Project id.")
    path: str = Field(..., min_length=1, description="Deleted project-relative source file path.")
    deleted: bool = Field(..., description="Whether the file delete marker or row deletion was applied.")
