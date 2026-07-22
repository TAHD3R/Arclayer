from __future__ import annotations

import pytest
from pydantic import BaseModel, ConfigDict

from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.provider_effect_contracts import (
    ProviderEffectContractRegistry,
    PydanticProviderEffectContract,
)


class ManifestV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    object_keys: tuple[str, ...]


class CommittedV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    marker_revision: str


class CleanedV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cleanup_run_id: str


class PermissiveManifest(BaseModel):
    object_keys: tuple[str, ...]


def _registry() -> ProviderEffectContractRegistry:
    return ProviderEffectContractRegistry([
        PydanticProviderEffectContract(
            effect_type="asset.thumbnail.objects",
            schema_version=1,
            manifest_model=ManifestV1,
            settlement_models={
                ProviderEffectDisposition.COMMITTED: CommittedV1,
                ProviderEffectDisposition.CLEANED: CleanedV1,
            },
        )
    ])


@pytest.mark.parametrize(
    ("effect_type", "schema_version"),
    [
        ("unknown.effect", 1),
        ("asset.thumbnail.objects", 2),
    ],
)
def test_registry_rejects_unknown_type_or_version(effect_type: str, schema_version: int) -> None:
    with pytest.raises(JobExecutionStateInvariantError, match="Unknown provider effect contract"):
        _registry().validate_manifest(
            effect_type=effect_type,
            schema_version=schema_version,
            value={"object_keys": ["safe"]},
        )


def test_registry_rejects_cross_contract_manifest_and_settlement() -> None:
    registry = _registry()
    with pytest.raises(JobExecutionStateInvariantError, match="manifest does not match"):
        registry.validate_manifest(
            effect_type="asset.thumbnail.objects",
            schema_version=1,
            value={"object_keys": ["safe"], "marker_revision": "wrong-contract"},
        )
    with pytest.raises(JobExecutionStateInvariantError, match="settlement does not match"):
        registry.validate_settlement_reference(
            effect_type="asset.thumbnail.objects",
            schema_version=1,
            disposition=ProviderEffectDisposition.CLEANED,
            value={"marker_revision": "wrong-disposition"},
        )


def test_registry_returns_canonical_versioned_json() -> None:
    registry = _registry()

    assert registry.validate_manifest(
        effect_type="asset.thumbnail.objects",
        schema_version=1,
        value={"object_keys": ["b", "a"]},
    ) == {"object_keys": ["b", "a"]}
    assert registry.validate_settlement_reference(
        effect_type="asset.thumbnail.objects",
        schema_version=1,
        disposition=ProviderEffectDisposition.COMMITTED,
        value={"marker_revision": "asset-v1"},
    ) == {"marker_revision": "asset-v1"}


def test_pydantic_contract_requires_strict_extra_forbid_models() -> None:
    with pytest.raises(ValueError, match="extra='forbid'"):
        PydanticProviderEffectContract(
            effect_type="asset.thumbnail.objects",
            schema_version=1,
            manifest_model=PermissiveManifest,
            settlement_models={
                ProviderEffectDisposition.COMMITTED: CommittedV1,
                ProviderEffectDisposition.CLEANED: CleanedV1,
            },
        )
