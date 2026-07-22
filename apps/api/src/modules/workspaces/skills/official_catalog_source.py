from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.modules.workspaces.skills.authoring import INSTRUCTIONS_PATH, MAX_INLINE_PACKAGE_BYTES
from src.modules.workspaces.skills.manifest import (
    SkillDataEgressDeclarationV1,
    SkillManifestResourceV1,
    SkillManifestV1,
    SkillPermissionDeclarationV1,
    SkillPublisherV1,
    SkillToolRequirementV1,
    compute_skill_package_checksum,
    normalize_skill_resource_path,
    skill_content_digest,
    validate_skill_package_checksum,
)
from src.modules.workspaces.skills.validation import contains_skill_secret

OFFICIAL_SKILL_CATALOG_REVISION = 1
OFFICIAL_SKILL_PUBLISHER_ID = "arclayer"
OFFICIAL_SKILL_PUBLISHER_NAME = "Arclayer"


class OfficialSkillResourceAsset(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    path: str = Field(min_length=1, max_length=512)
    content: str = Field(min_length=1, max_length=524_288)
    mime_type: str = "text/markdown"

    @field_validator("path")
    @classmethod
    def _require_normalized_path(cls, value: str) -> str:
        normalized = normalize_skill_resource_path(value)
        if normalized != value or normalized == INSTRUCTIONS_PATH:
            raise ValueError("Official Skill reference path must be normalized and cannot replace SKILL.md")
        return value


class OfficialSkillAsset(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    stable_key: str = Field(min_length=1, max_length=192)
    slug: str = Field(min_length=1, max_length=96)
    display_name_key: str = Field(min_length=1, max_length=160)
    description_key: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(min_length=1, max_length=1000)
    semantic_version: str = Field(min_length=1, max_length=64)
    instructions: str = Field(min_length=1, max_length=524_288)
    references: tuple[OfficialSkillResourceAsset, ...] = Field(default_factory=tuple, max_length=32)
    required_tools: tuple[SkillToolRequirementV1, ...] = Field(default_factory=tuple, max_length=128)
    permissions: tuple[SkillPermissionDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    data_egress: tuple[SkillDataEgressDeclarationV1, ...] = Field(default_factory=tuple, max_length=128)
    capability_tags: tuple[str, ...] = Field(default_factory=tuple, max_length=128)
    expected_checksum: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class OfficialSkillResourceContent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    path: str
    role: Literal["instructions", "reference", "asset"]
    mime_type: str
    content: str
    digest: str

    @property
    def byte_size(self) -> int:
        return len(self.content.encode("utf-8"))


class OfficialSkillBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    asset: OfficialSkillAsset
    manifest: SkillManifestV1
    resources: tuple[OfficialSkillResourceContent, ...]


class OfficialSkillCatalogSource(Protocol):
    def load(self) -> tuple[OfficialSkillAsset, ...]: ...


class PackagedOfficialSkillCatalogSource:
    def load(self) -> tuple[OfficialSkillAsset, ...]:
        from src.modules.workspaces.skills.official_catalog_assets import OFFICIAL_SKILL_ASSETS

        return OFFICIAL_SKILL_ASSETS


def build_official_skill_bundles(
    assets: tuple[OfficialSkillAsset, ...],
    *,
    verify_expected_checksums: bool = True,
) -> tuple[OfficialSkillBundle, ...]:
    _validate_catalog_identities(assets)
    bundles = tuple(
        _build_official_skill_bundle(asset, verify_expected_checksum=verify_expected_checksums) for asset in assets
    )
    if len({bundle.manifest.skill_id for bundle in bundles}) != len(bundles):
        raise ValueError("Official Skill catalog contains duplicate manifest Skill IDs")
    return bundles


def _build_official_skill_bundle(
    asset: OfficialSkillAsset,
    *,
    verify_expected_checksum: bool,
) -> OfficialSkillBundle:
    resources = (
        _resource(path=INSTRUCTIONS_PATH, role="instructions", content=asset.instructions),
        *(
            _resource(
                path=reference.path,
                role="reference",
                content=reference.content,
                mime_type=reference.mime_type,
            )
            for reference in asset.references
        ),
    )
    if sum(resource.byte_size for resource in resources) > MAX_INLINE_PACKAGE_BYTES:
        raise ValueError("Official Skill package exceeds the one MiB storage boundary")
    if any(contains_skill_secret(resource.content) for resource in resources):
        raise ValueError(f"Official Skill contains credential-like content: {asset.stable_key}")
    manifest = SkillManifestV1(
        skill_id=asset.stable_key,
        name=asset.name,
        description=asset.description,
        publisher=SkillPublisherV1(
            id=OFFICIAL_SKILL_PUBLISHER_ID,
            name=OFFICIAL_SKILL_PUBLISHER_NAME,
            verified=True,
        ),
        instructions_entrypoint=INSTRUCTIONS_PATH,
        resources=tuple(
            SkillManifestResourceV1(
                path=resource.path,
                role=resource.role,
                mime_type=resource.mime_type,
                byte_size=resource.byte_size,
                digest=resource.digest,
            )
            for resource in resources
        ),
        required_tools=asset.required_tools,
        permissions=asset.permissions,
        data_egress=asset.data_egress,
        capability_tags=asset.capability_tags,
        checksum="sha256:" + ("0" * 64),
    )
    manifest = manifest.model_copy(update={"checksum": compute_skill_package_checksum(manifest)})
    validate_skill_package_checksum(manifest)
    if verify_expected_checksum and manifest.checksum != asset.expected_checksum:
        raise ValueError(f"Official Skill checksum mismatch: {asset.stable_key}")
    return OfficialSkillBundle(asset=asset, manifest=manifest, resources=resources)


def _resource(
    *,
    path: str,
    role: Literal["instructions", "reference", "asset"],
    content: str,
    mime_type: str = "text/markdown",
) -> OfficialSkillResourceContent:
    return OfficialSkillResourceContent(
        path=path,
        role=role,
        mime_type=mime_type,
        content=content,
        digest=skill_content_digest(content.encode("utf-8")),
    )


def _validate_catalog_identities(assets: tuple[OfficialSkillAsset, ...]) -> None:
    identities = (
        tuple(asset.stable_key for asset in assets),
        tuple(asset.slug for asset in assets),
        tuple(asset.display_name_key for asset in assets),
        tuple(asset.description_key for asset in assets),
    )
    if any(len(values) != len(set(values)) for values in identities):
        raise ValueError("Official Skill catalog contains duplicate identities or i18n keys")
