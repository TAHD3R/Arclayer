from __future__ import annotations

import hashlib
import re
import unicodedata
from pathlib import PurePosixPath
from typing import Literal, Self

import orjson
from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema

_CHECKSUM_PATTERN = r"^sha256:[0-9a-f]{64}$"
_IDENTIFIER_PATTERN = re.compile(r"^[a-z0-9]+(?:[._:-][a-z0-9]+)*$")
_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_ALLOWED_TEXT_MIME_TYPES = frozenset({"text/markdown", "text/plain", "application/json"})


class SkillPublisherV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=192)
    name: str = Field(min_length=1, max_length=128)
    verified: bool


class SkillCompatibilityV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    agent_protocol: Literal[1] = 1
    arclayer_range: str = Field(default=">=1", min_length=1, max_length=64)


class SkillToolRequirementV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    tool_id: str = Field(min_length=1, max_length=192)
    version_range: str = Field(default=">=1", min_length=1, max_length=64)
    intended_use: str = Field(min_length=1, max_length=500)

    @field_validator("tool_id")
    @classmethod
    def _validate_tool_id(cls, value: str) -> str:
        if not _IDENTIFIER_PATTERN.fullmatch(value):
            raise ValueError("Tool ID is invalid")
        return value


class SkillPermissionDeclarationV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    action: str = Field(min_length=1, max_length=192)
    purpose: str = Field(min_length=1, max_length=500)

    @field_validator("action")
    @classmethod
    def _validate_action(cls, value: str) -> str:
        if not _IDENTIFIER_PATTERN.fullmatch(value):
            raise ValueError("Permission action is invalid")
        return value


class SkillDataEgressDeclarationV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    destination: str = Field(min_length=1, max_length=256)
    purpose: str = Field(min_length=1, max_length=500)
    data_classes: tuple[str, ...] = Field(min_length=1, max_length=32)

    @field_validator("data_classes")
    @classmethod
    def _validate_data_classes(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        if len(values) != len(set(values)) or any(not _IDENTIFIER_PATTERN.fullmatch(value) for value in values):
            raise ValueError("Data classes must be unique stable identifiers")
        return values


class SkillManifestResourceV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    path: str = Field(min_length=1, max_length=512)
    role: Literal["instructions", "reference", "asset"]
    mime_type: str = Field(min_length=1, max_length=128)
    byte_size: int = Field(ge=1)
    digest: str = Field(pattern=_CHECKSUM_PATTERN)

    @field_validator("path")
    @classmethod
    def _normalize_path(cls, value: str) -> str:
        normalized = normalize_skill_resource_path(value)
        if normalized != value:
            raise ValueError("Skill resource path must already be normalized")
        return normalized

    @model_validator(mode="after")
    def _validate_role_mime(self) -> Self:
        if self.role in {"instructions", "reference"} and self.mime_type not in _ALLOWED_TEXT_MIME_TYPES:
            raise ValueError("Instruction and reference resources must use an allowed inert text MIME type")
        return self


class SkillManifestV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    manifest_version: Literal[1] = 1
    skill_id: str = Field(min_length=2, max_length=192)
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(min_length=1, max_length=1000)
    publisher: SkillPublisherV1
    compatibility: SkillCompatibilityV1 = Field(default_factory=SkillCompatibilityV1)
    instructions_entrypoint: str = Field(min_length=1, max_length=512)
    resources: tuple[SkillManifestResourceV1, ...] = Field(min_length=1, max_length=256)
    required_tools: tuple[SkillToolRequirementV1, ...] = Field(default_factory=tuple, max_length=128)
    permissions: tuple[SkillPermissionDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    data_egress: tuple[SkillDataEgressDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    capability_tags: tuple[str, ...] = Field(default_factory=tuple, max_length=128)
    checksum: str = Field(pattern=_CHECKSUM_PATTERN)

    @field_validator("skill_id")
    @classmethod
    def _validate_skill_id(cls, value: str) -> str:
        if not _IDENTIFIER_PATTERN.fullmatch(value):
            raise ValueError("Skill ID is invalid")
        return value

    @field_validator("capability_tags")
    @classmethod
    def _validate_capability_tags(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        if len(values) != len(set(values)) or any(not _IDENTIFIER_PATTERN.fullmatch(value) for value in values):
            raise ValueError("Capability tags must be unique stable identifiers")
        return values

    @model_validator(mode="after")
    def _validate_resources(self) -> Self:
        normalized_entrypoint = normalize_skill_resource_path(self.instructions_entrypoint)
        if normalized_entrypoint != self.instructions_entrypoint:
            raise ValueError("Skill instructions entrypoint must already be normalized")
        paths = tuple(resource.path for resource in self.resources)
        if len(paths) != len(set(paths)) or len(paths) != len({path.casefold() for path in paths}):
            raise ValueError("Skill resource paths must be unique without case collisions")
        entrypoints = tuple(
            resource
            for resource in self.resources
            if resource.path == self.instructions_entrypoint and resource.role == "instructions"
        )
        if len(entrypoints) != 1 or entrypoints[0].mime_type not in {"text/markdown", "text/plain"}:
            raise ValueError("Skill instructions entrypoint must resolve to one declared instructions resource")
        identities = (
            tuple(item.tool_id for item in self.required_tools),
            tuple(item.action for item in self.permissions),
            tuple(item.destination for item in self.data_egress),
        )
        if any(len(values) != len(set(values)) for values in identities):
            raise ValueError("Skill declarations must use unique stable identities")
        return self


def normalize_skill_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip().lower()
    if not _SLUG_PATTERN.fullmatch(normalized):
        raise ValueError("Skill slug must contain lowercase letters, numbers, and single hyphens")
    return normalized


def normalize_skill_resource_path(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value).strip()
    if (
        not normalized
        or "\\" in normalized
        or normalized.startswith("/")
        or any(ord(character) < 32 or ord(character) == 127 for character in normalized)
    ):
        raise ValueError("Skill resource path is invalid")
    path = PurePosixPath(normalized)
    if any(part in {"", ".", ".."} for part in path.parts) or str(path) != normalized:
        raise ValueError("Skill resource path must stay inside the package root")
    return normalized


def skill_content_digest(content: bytes) -> str:
    return f"sha256:{hashlib.sha256(content).hexdigest()}"


def compute_skill_package_checksum(manifest: SkillManifestV1) -> str:
    payload = manifest.model_dump(mode="json", by_alias=True, exclude={"checksum"})
    payload["resources"] = [
        resource.model_dump(mode="json", by_alias=True)
        for resource in sorted(manifest.resources, key=lambda item: item.path)
    ]
    canonical = orjson.dumps(payload, option=orjson.OPT_SORT_KEYS)
    return skill_content_digest(canonical)


def validate_skill_package_checksum(manifest: SkillManifestV1) -> None:
    expected = compute_skill_package_checksum(manifest)
    if manifest.checksum != expected:
        raise ValueError("Skill manifest checksum does not match its canonical package content")
