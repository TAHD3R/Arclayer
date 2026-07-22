from __future__ import annotations

from typing import Final, Literal, cast
from unicodedata import category
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_contracts import PydanticProviderEffectContract
from src.modules.jobs.provider_effect_schema import ProviderEffectSnapshot

ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE: Final = "asset.thumbnail.objects"
ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION: Final = 1
ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY: Final = "generated-objects"

_HEX64_PATTERN = r"^[0-9a-f]{64}$"


class _StrictAssetThumbnailProviderEffectModel(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        str_strip_whitespace=False,
    )


class AssetThumbnailProviderOutputV1(_StrictAssetThumbnailProviderEffectModel):
    """One exact object produced by the v1 thumbnail profile."""

    width: int = Field(..., gt=0)
    object_key: str = Field(..., min_length=1, max_length=1024)


class AssetThumbnailProviderEffectManifestV1(_StrictAssetThumbnailProviderEffectModel):
    """Canonical logical context and complete provider output set for one Job."""

    job_id: UUID
    project_id: UUID
    asset_id: UUID
    request_fingerprint: str = Field(..., pattern=_HEX64_PATTERN)
    source_revision: str = Field(..., min_length=1, max_length=160)
    thumbnail_profile_version: Literal[1] = 1
    target_bucket: str | None = Field(default=None, max_length=255)
    outputs: tuple[AssetThumbnailProviderOutputV1, ...] = Field(..., min_length=1, max_length=4)

    @field_validator("target_bucket")
    @classmethod
    def validate_target_bucket(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not value or value != value.strip():
            raise ValueError("targetBucket must be non-empty and must not have surrounding whitespace")
        if any(character.isspace() or category(character) in {"Cc", "Cf"} for character in value):
            raise ValueError("targetBucket cannot contain whitespace or control characters")
        return value

    @model_validator(mode="after")
    def validate_canonical_manifest(self) -> AssetThumbnailProviderEffectManifestV1:
        checksum_revision = self.source_revision
        asset_revision = f"asset-id:{self.asset_id}"
        is_checksum_revision = len(checksum_revision) == 64 and all(
            character in "0123456789abcdef" for character in checksum_revision
        )
        if not is_checksum_revision and checksum_revision != asset_revision:
            raise ValueError("sourceRevision must be lowercase SHA-256 or the exact Asset identity revision")

        widths = tuple(output.width for output in self.outputs)
        if len(set(widths)) != len(widths):
            raise ValueError("outputs must have unique widths")
        if widths != tuple(sorted(widths)):
            raise ValueError("outputs must be sorted by ascending width")

        object_keys = tuple(output.object_key for output in self.outputs)
        if len(set(object_keys)) != len(object_keys):
            raise ValueError("outputs must have unique object keys")
        prefix = f"projects/{self.project_id}/assets/{self.asset_id}/thumbnails/v1/{self.job_id}/"
        for output in self.outputs:
            allowed_keys = {
                f"{prefix}thumb-{output.width}.jpg",
                f"{prefix}thumb-{output.width}.png",
            }
            if output.object_key not in allowed_keys:
                raise ValueError("output objectKey must be the exact canonical Job-owned thumbnail key")
        return self


class AssetThumbnailProviderEffectCommittedReferenceV1(_StrictAssetThumbnailProviderEffectModel):
    """Byte-stable evidence that one Effect is represented by the tenant marker."""

    kind: Literal["committed"] = "committed"
    effect_id: UUID
    manifest_hash: str = Field(..., pattern=_HEX64_PATTERN)
    output_identity: str = Field(..., pattern=_HEX64_PATTERN)


class AssetThumbnailProviderEffectCleanedReferenceV1(_StrictAssetThumbnailProviderEffectModel):
    """Byte-stable evidence that every object owned by one Effect was removed."""

    kind: Literal["cleaned"] = "cleaned"
    effect_id: UUID
    manifest_hash: str = Field(..., pattern=_HEX64_PATTERN)
    output_identity: str = Field(..., pattern=_HEX64_PATTERN)


def build_asset_thumbnail_output_identity(
    *,
    effect: ProviderEffectSnapshot,
    manifest: AssetThumbnailProviderEffectManifestV1,
) -> str:
    """Hash one logical output set and its exact immutable storage route."""

    expected_contract = (
        ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
        ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
        ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    )
    observed_contract = (effect.effect_type, effect.effect_key, effect.schema_version)
    if observed_contract != expected_contract:
        raise JobExecutionStateInvariantError(f"Provider effect {effect.id} is not the thumbnail v1 output contract")
    if effect.job_id != manifest.job_id:
        raise JobExecutionStateInvariantError(f"Provider effect {effect.id} belongs to another thumbnail Job")

    canonical_manifest = cast(JsonObject, manifest.model_dump(mode="json", by_alias=False))
    if effect.manifest != canonical_manifest:
        raise JobExecutionStateInvariantError(
            f"Provider effect {effect.id} manifest differs from the canonical thumbnail manifest"
        )
    if effect.manifest_hash != hash_json(canonical_manifest):
        raise JobExecutionStateInvariantError(
            f"Provider effect {effect.id} manifest hash differs from its canonical thumbnail manifest"
        )

    logical_manifest = cast(
        JsonObject,
        manifest.model_dump(mode="json", by_alias=False, exclude={"target_bucket"}),
    )
    identity_envelope: JsonObject = {
        "effect_type": ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
        "schema_version": ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
        "profile_id": str(effect.profile_id),
        "profile_revision_id": str(effect.profile_revision_id),
        "target_bucket": manifest.target_bucket,
        "manifest": logical_manifest,
    }
    return hash_json(identity_envelope)


def build_asset_thumbnail_provider_effect_contract() -> PydanticProviderEffectContract:
    """Build the exact thumbnail v1 contract for explicit jobs composition."""

    return PydanticProviderEffectContract(
        effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
        schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
        manifest_model=AssetThumbnailProviderEffectManifestV1,
        settlement_models={
            ProviderEffectDisposition.COMMITTED: AssetThumbnailProviderEffectCommittedReferenceV1,
            ProviderEffectDisposition.CLEANED: AssetThumbnailProviderEffectCleanedReferenceV1,
        },
    )
