from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

import pytest
from pydantic import ValidationError

from src.common.types.json_types import JsonObject
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.assets.jobs.thumbnail_provider_effects import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailProviderEffectCleanedReferenceV1,
    AssetThumbnailProviderEffectCommittedReferenceV1,
    AssetThumbnailProviderEffectManifestV1,
    AssetThumbnailProviderOutputV1,
    build_asset_thumbnail_output_identity,
    build_asset_thumbnail_provider_effect_contract,
)
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_schema import ProviderEffectSnapshot

JOB_ID = UUID("11111111-1111-4111-8111-111111111111")
PROJECT_ID = UUID("22222222-2222-4222-8222-222222222222")
ASSET_ID = UUID("33333333-3333-4333-8333-333333333333")
PROFILE_ID = UUID("44444444-4444-4444-8444-444444444444")
PROFILE_REVISION_ID = UUID("55555555-5555-4555-8555-555555555555")
EFFECT_ID = UUID("66666666-6666-4666-8666-666666666666")
ATTEMPT_ID = UUID("77777777-7777-4777-8777-777777777777")


def _object_key(width: int, *, extension: str = "jpg") -> str:
    return f"projects/{PROJECT_ID}/assets/{ASSET_ID}/thumbnails/v1/{JOB_ID}/thumb-{width}.{extension}"


def _manifest(
    *,
    outputs: tuple[AssetThumbnailProviderOutputV1, ...] | None = None,
    request_fingerprint: str = "a" * 64,
    source_revision: str = "b" * 64,
    target_bucket: str | None = "tenant-assets",
) -> AssetThumbnailProviderEffectManifestV1:
    return AssetThumbnailProviderEffectManifestV1(
        job_id=JOB_ID,
        project_id=PROJECT_ID,
        asset_id=ASSET_ID,
        request_fingerprint=request_fingerprint,
        source_revision=source_revision,
        target_bucket=target_bucket,
        outputs=(
            outputs
            if outputs is not None
            else (AssetThumbnailProviderOutputV1(width=320, object_key=_object_key(320)),)
        ),
    )


def _snapshot(
    manifest: AssetThumbnailProviderEffectManifestV1,
    *,
    effect_id: UUID = EFFECT_ID,
    owner_attempt_id: UUID = ATTEMPT_ID,
    profile_id: UUID = PROFILE_ID,
    profile_revision_id: UUID = PROFILE_REVISION_ID,
    effect_type: str = ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    effect_key: str = ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
    schema_version: int = ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    job_id: UUID | None = None,
    persisted_manifest: JsonObject | None = None,
    manifest_hash: str | None = None,
) -> ProviderEffectSnapshot:
    canonical_manifest = cast(JsonObject, manifest.model_dump(mode="json", by_alias=False))
    stored_manifest = persisted_manifest if persisted_manifest is not None else canonical_manifest
    return ProviderEffectSnapshot(
        id=effect_id,
        job_id=job_id or manifest.job_id,
        owner_attempt_id=owner_attempt_id,
        profile_id=profile_id,
        profile_revision_id=profile_revision_id,
        effect_type=effect_type,
        effect_key=effect_key,
        schema_version=schema_version,
        manifest=stored_manifest,
        manifest_hash=manifest_hash or hash_json(stored_manifest),
        disposition=ProviderEffectDisposition.ACTIVE,
        registered_at=datetime(2026, 7, 18, 9, 30, tzinfo=UTC),
    )


def test_thumbnail_provider_effect_v1_builds_the_exact_registered_contract() -> None:
    manifest = _manifest(
        outputs=(
            AssetThumbnailProviderOutputV1(width=320, object_key=_object_key(320)),
            AssetThumbnailProviderOutputV1(width=640, object_key=_object_key(640, extension="png")),
        ),
    )

    contract = build_asset_thumbnail_provider_effect_contract()

    assert ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE == "asset.thumbnail.objects"
    assert ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION == 1
    assert ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY == "generated-objects"
    assert manifest.thumbnail_profile_version == 1
    assert contract.effect_type == ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE
    assert contract.schema_version == ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION
    assert contract.manifest_model is AssetThumbnailProviderEffectManifestV1
    assert contract.settlement_models == {
        ProviderEffectDisposition.COMMITTED: AssetThumbnailProviderEffectCommittedReferenceV1,
        ProviderEffectDisposition.CLEANED: AssetThumbnailProviderEffectCleanedReferenceV1,
    }
    canonical_manifest = cast(JsonObject, manifest.model_dump(mode="json", by_alias=False))
    assert contract.validate_manifest(canonical_manifest) == canonical_manifest


def test_thumbnail_provider_effect_models_are_strict_frozen_and_extra_forbidden() -> None:
    manifest = _manifest()

    with pytest.raises(ValidationError, match="frozen_instance"):
        manifest.target_bucket = "other-bucket"
    with pytest.raises(ValidationError):
        AssetThumbnailProviderOutputV1.model_validate({"width": "320", "object_key": _object_key(320)})
    with pytest.raises(ValidationError, match="extra_forbidden"):
        AssetThumbnailProviderOutputV1.model_validate({
            "width": 320,
            "object_key": _object_key(320),
            "credential_profile_key": "must-not-persist",
        })
    with pytest.raises(ValidationError, match="extra_forbidden"):
        AssetThumbnailProviderEffectManifestV1.model_validate(
            manifest.model_dump() | {"attempt_id": UUID("88888888-8888-4888-8888-888888888888")}
        )


@pytest.mark.parametrize(
    "outputs",
    [
        (),
        tuple(AssetThumbnailProviderOutputV1(width=width, object_key=_object_key(width)) for width in range(1, 6)),
        (
            AssetThumbnailProviderOutputV1(width=640, object_key=_object_key(640)),
            AssetThumbnailProviderOutputV1(width=320, object_key=_object_key(320)),
        ),
        (
            AssetThumbnailProviderOutputV1(width=320, object_key=_object_key(320)),
            AssetThumbnailProviderOutputV1(width=320, object_key=_object_key(320, extension="png")),
        ),
        (
            AssetThumbnailProviderOutputV1(width=320, object_key=_object_key(320)),
            AssetThumbnailProviderOutputV1(width=640, object_key=_object_key(320)),
        ),
    ],
)
def test_manifest_rejects_noncanonical_output_sets(
    outputs: tuple[AssetThumbnailProviderOutputV1, ...],
) -> None:
    with pytest.raises(ValidationError):
        _manifest(outputs=outputs)


@pytest.mark.parametrize(
    "object_key",
    [
        f"projects/{PROJECT_ID}/assets/{ASSET_ID}/thumbnails/v2/{JOB_ID}/thumb-320.jpg",
        f"projects/{PROJECT_ID}/assets/{ASSET_ID}/thumbnails/v1/{UUID('99999999-9999-4999-8999-999999999999')}/thumb-320.jpg",
        f"projects/{PROJECT_ID}/assets/{UUID('99999999-9999-4999-8999-999999999999')}/thumbnails/v1/{JOB_ID}/thumb-320.jpg",
        f"projects/{PROJECT_ID}/assets/{ASSET_ID}/thumbnails/v1/{JOB_ID}/thumb-640.jpg",
        f"projects/{PROJECT_ID}/assets/{ASSET_ID}/thumbnails/v1/{JOB_ID}/thumb-0320.jpg",
        f"projects/{PROJECT_ID}/assets/{ASSET_ID}/thumbnails/v1/{JOB_ID}/thumb-320.webp",
        f"projects/{PROJECT_ID}/assets/{ASSET_ID}/thumbnails/v1/{JOB_ID}/nested/thumb-320.jpg",
    ],
)
def test_manifest_rejects_outputs_outside_its_exact_job_owned_path(object_key: str) -> None:
    with pytest.raises(ValidationError):
        _manifest(outputs=(AssetThumbnailProviderOutputV1(width=320, object_key=object_key),))


@pytest.mark.parametrize(
    "request_fingerprint",
    ["A" * 64, "a" * 63, "a" * 65, "g" * 64, " " + "a" * 64],
)
def test_manifest_rejects_noncanonical_request_fingerprints(request_fingerprint: str) -> None:
    with pytest.raises(ValidationError):
        _manifest(request_fingerprint=request_fingerprint)


@pytest.mark.parametrize(
    "source_revision",
    [
        "B" * 64,
        "b" * 63,
        "g" * 64,
        f"asset-id:{UUID('99999999-9999-4999-8999-999999999999')}",
        f" asset-id:{ASSET_ID}",
    ],
)
def test_manifest_rejects_source_revisions_not_bound_to_the_asset(source_revision: str) -> None:
    with pytest.raises(ValidationError):
        _manifest(source_revision=source_revision)


def test_manifest_accepts_the_exact_asset_id_source_revision() -> None:
    manifest = _manifest(source_revision=f"asset-id:{ASSET_ID}", target_bucket=None)

    assert manifest.source_revision == f"asset-id:{ASSET_ID}"
    assert manifest.target_bucket is None


@pytest.mark.parametrize(
    "target_bucket",
    ["", " tenant-assets", "tenant-assets ", "tenant assets", "tenant\tassets", "tenant\x00assets", "x" * 256],
)
def test_manifest_rejects_noncanonical_target_buckets(target_bucket: str) -> None:
    with pytest.raises(ValidationError):
        _manifest(target_bucket=target_bucket)


def test_terminal_references_use_independent_literal_schemas() -> None:
    committed = AssetThumbnailProviderEffectCommittedReferenceV1(
        effect_id=EFFECT_ID,
        manifest_hash="c" * 64,
        output_identity="d" * 64,
    )
    cleaned = AssetThumbnailProviderEffectCleanedReferenceV1(
        effect_id=EFFECT_ID,
        manifest_hash="c" * 64,
        output_identity="d" * 64,
    )
    contract = build_asset_thumbnail_provider_effect_contract()

    assert committed.model_dump(mode="json") == {
        "kind": "committed",
        "effect_id": str(EFFECT_ID),
        "manifest_hash": "c" * 64,
        "output_identity": "d" * 64,
    }
    assert cleaned.model_dump(mode="json") == {
        "kind": "cleaned",
        "effect_id": str(EFFECT_ID),
        "manifest_hash": "c" * 64,
        "output_identity": "d" * 64,
    }
    with pytest.raises(ValidationError):
        contract.validate_settlement_reference(
            disposition=ProviderEffectDisposition.COMMITTED,
            value=cast(JsonObject, cleaned.model_dump(mode="json")),
        )
    with pytest.raises(ValidationError):
        contract.validate_settlement_reference(
            disposition=ProviderEffectDisposition.CLEANED,
            value=cast(JsonObject, committed.model_dump(mode="json")),
        )


@pytest.mark.parametrize("hash_value", ["C" * 64, "c" * 63, "g" * 64])
def test_terminal_references_reject_noncanonical_hashes(hash_value: str) -> None:
    with pytest.raises(ValidationError):
        AssetThumbnailProviderEffectCommittedReferenceV1(
            effect_id=EFFECT_ID,
            manifest_hash=hash_value,
            output_identity="d" * 64,
        )
    with pytest.raises(ValidationError):
        AssetThumbnailProviderEffectCleanedReferenceV1(
            effect_id=EFFECT_ID,
            manifest_hash="c" * 64,
            output_identity=hash_value,
        )


@pytest.mark.parametrize("extra_field", ["cleanup_run_id", "settled_by_attempt_id", "reason", "completed_at"])
def test_terminal_references_reject_attempt_or_run_specific_evidence(extra_field: str) -> None:
    payload: dict[str, object] = {
        "kind": "committed",
        "effect_id": EFFECT_ID,
        "manifest_hash": "c" * 64,
        "output_identity": "d" * 64,
        extra_field: "not-byte-stable",
    }

    with pytest.raises(ValidationError, match="extra_forbidden"):
        AssetThumbnailProviderEffectCommittedReferenceV1.model_validate(payload)


def test_output_identity_is_stable_across_attempts_and_effect_rows() -> None:
    manifest = _manifest()
    first = _snapshot(manifest)
    replay = _snapshot(
        manifest,
        effect_id=UUID("88888888-8888-4888-8888-888888888888"),
        owner_attempt_id=UUID("99999999-9999-4999-8999-999999999999"),
    )

    first_identity = build_asset_thumbnail_output_identity(effect=first, manifest=manifest)
    replay_identity = build_asset_thumbnail_output_identity(effect=replay, manifest=manifest)

    assert first_identity == replay_identity
    assert len(first_identity) == 64
    assert set(first_identity) <= set("0123456789abcdef")


def test_output_identity_changes_with_exact_route_or_target_bucket() -> None:
    manifest = _manifest()
    other_bucket_manifest = _manifest(target_bucket="public-assets")
    base_identity = build_asset_thumbnail_output_identity(effect=_snapshot(manifest), manifest=manifest)

    assert (
        build_asset_thumbnail_output_identity(
            effect=_snapshot(manifest, profile_id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")),
            manifest=manifest,
        )
        != base_identity
    )
    assert (
        build_asset_thumbnail_output_identity(
            effect=_snapshot(
                manifest,
                profile_revision_id=UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
            ),
            manifest=manifest,
        )
        != base_identity
    )
    assert (
        build_asset_thumbnail_output_identity(
            effect=_snapshot(other_bucket_manifest),
            manifest=other_bucket_manifest,
        )
        != base_identity
    )


def test_output_identity_changes_with_logical_context_or_output_set() -> None:
    manifest = _manifest()
    changed_context = _manifest(request_fingerprint="c" * 64)
    changed_outputs = _manifest(
        outputs=(AssetThumbnailProviderOutputV1(width=640, object_key=_object_key(640)),),
    )
    base_identity = build_asset_thumbnail_output_identity(effect=_snapshot(manifest), manifest=manifest)

    assert (
        build_asset_thumbnail_output_identity(
            effect=_snapshot(changed_context),
            manifest=changed_context,
        )
        != base_identity
    )
    assert (
        build_asset_thumbnail_output_identity(
            effect=_snapshot(changed_outputs),
            manifest=changed_outputs,
        )
        != base_identity
    )


@pytest.mark.parametrize(
    ("effect_type", "effect_key", "schema_version", "job_id"),
    [
        (
            "asset.thumbnail.other",
            ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
            ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
            None,
        ),
        (
            ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
            "other-objects",
            ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
            None,
        ),
        (
            ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
            ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
            2,
            None,
        ),
        (
            ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
            ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
            ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
            UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        ),
    ],
)
def test_output_identity_rejects_cross_contract_or_cross_job_effects(
    effect_type: str,
    effect_key: str,
    schema_version: int,
    job_id: UUID | None,
) -> None:
    manifest = _manifest()

    with pytest.raises(JobExecutionStateInvariantError):
        build_asset_thumbnail_output_identity(
            effect=_snapshot(
                manifest,
                effect_type=effect_type,
                effect_key=effect_key,
                schema_version=schema_version,
                job_id=job_id,
            ),
            manifest=manifest,
        )


def test_output_identity_rejects_noncanonical_or_hash_drifted_manifests() -> None:
    manifest = _manifest()
    canonical = cast(JsonObject, manifest.model_dump(mode="json", by_alias=False))
    noncanonical = canonical | {"attempt_id": str(ATTEMPT_ID)}

    with pytest.raises(JobExecutionStateInvariantError):
        build_asset_thumbnail_output_identity(
            effect=_snapshot(manifest, persisted_manifest=noncanonical),
            manifest=manifest,
        )
    with pytest.raises(JobExecutionStateInvariantError):
        build_asset_thumbnail_output_identity(
            effect=_snapshot(manifest, manifest_hash="0" * 64),
            manifest=manifest,
        )
