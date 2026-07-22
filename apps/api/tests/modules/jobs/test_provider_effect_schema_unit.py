from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.common.types.json_types import JsonObject
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_schema import (
    ProviderEffectRegistration,
    ProviderEffectSettlement,
    ProviderEffectSnapshot,
)
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_routes import (
    StorageProfileRoute,
    StorageProfileRouteBinding,
    storage_profile_route_hash,
)


def _route_binding() -> StorageProfileRouteBinding:
    route = StorageProfileRoute(
        provider=ObjectStorageProviderKind.AWS_S3,
        bucket="assets",
    )
    return StorageProfileRouteBinding(
        profile_id=uuid4(),
        profile_revision_id=uuid4(),
        route_hash=storage_profile_route_hash(route),
        route=route,
    )


def test_registration_rejects_recursive_secret_fields() -> None:
    with pytest.raises(ValidationError, match="cannot contain credential or secret fields"):
        ProviderEffectRegistration(
            route=_route_binding(),
            effect_type="asset.thumbnail.object",
            effect_key="thumb-320",
            schema_version=1,
            manifest={"objects": [{"object_key": "safe", "credential_ref": "must-not-persist"}]},
        )

    with pytest.raises(ValidationError, match="cannot contain credential or secret fields"):
        ProviderEffectRegistration(
            route=_route_binding(),
            effect_type="asset.thumbnail.object",
            effect_key="thumb-320",
            schema_version=1,
            manifest={"token_value": "must-not-persist"},
        )


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_registration_rejects_non_finite_json_numbers(value: float) -> None:
    with pytest.raises(ValidationError, match="non-finite"):
        ProviderEffectRegistration(
            route=_route_binding(),
            effect_type="asset.thumbnail.object",
            effect_key="thumb-320",
            schema_version=1,
            manifest={"provider_measurement": value},
        )


def test_registration_limits_effect_key_to_short_logical_identity() -> None:
    with pytest.raises(ValidationError):
        ProviderEffectRegistration(
            route=_route_binding(),
            effect_type="asset.thumbnail.object",
            effect_key="x" * 257,
            schema_version=1,
            manifest={"object_keys": ["provider/object/key-can-live-in-manifest"]},
        )


@pytest.mark.parametrize("schema_version", ["1", True])
def test_registration_rejects_coercible_schema_versions(schema_version: object) -> None:
    with pytest.raises(ValidationError):
        ProviderEffectRegistration.model_validate({
            "route": _route_binding().model_dump(mode="json"),
            "effect_type": "asset.thumbnail.object",
            "effect_key": "thumb-320",
            "schema_version": schema_version,
            "manifest": {"object_keys": ["safe"]},
        })


def test_settlement_canonicalizes_ids_and_rejects_duplicates_or_active() -> None:
    later = uuid4()
    earlier = uuid4()
    expected = tuple(sorted((later, earlier), key=lambda effect_id: effect_id.int))

    settlement = ProviderEffectSettlement(
        effect_ids=(later, earlier),
        disposition=ProviderEffectDisposition.CLEANED,
        settlement_reference={"cleanup_run_id": "cleanup-1"},
    )

    assert settlement.effect_ids == expected
    with pytest.raises(ValidationError, match="cannot contain duplicates"):
        ProviderEffectSettlement(
            effect_ids=(later, later),
            disposition=ProviderEffectDisposition.CLEANED,
            settlement_reference={},
        )
    with pytest.raises(ValidationError, match="only settle as committed or cleaned"):
        ProviderEffectSettlement(
            effect_ids=(later,),
            disposition=ProviderEffectDisposition.ACTIVE,
            settlement_reference={},
        )


def _effect_record(
    *,
    disposition: ProviderEffectDisposition = ProviderEffectDisposition.ACTIVE,
    manifest: JsonObject | None = None,
) -> ProviderEffectRecord:
    canonical_manifest: JsonObject
    if manifest is None:
        canonical_manifest = {"object_keys": ["projects/example/thumb.webp"]}
    else:
        canonical_manifest = manifest
    now = datetime.now(tz=UTC)
    record = ProviderEffectRecord(
        id=uuid4(),
        job_id=uuid4(),
        owner_attempt_id=uuid4(),
        profile_id=uuid4(),
        profile_revision_id=uuid4(),
        effect_type="asset.thumbnail.object",
        effect_key="thumb-320",
        schema_version=1,
        manifest=canonical_manifest,
        manifest_hash=hash_json(canonical_manifest),
        disposition=disposition,
        registered_at=now,
        settled_at=None,
        settled_by_attempt_id=None,
        settlement_reference=None,
        created_at=now,
        updated_at=now,
    )
    record.job_id = uuid4()
    record.owner_attempt_id = uuid4()
    record.profile_id = uuid4()
    record.profile_revision_id = uuid4()
    record.settled_by_attempt_id = None
    return record


def test_snapshot_recomputes_manifest_hash_and_validates_disposition_evidence() -> None:
    active = _effect_record()
    assert ProviderEffectSnapshot.from_record(active).disposition == ProviderEffectDisposition.ACTIVE

    active.manifest_hash = "0" * 64
    with pytest.raises(JobExecutionStateInvariantError, match="manifest hash"):
        ProviderEffectSnapshot.from_record(active)

    terminal = _effect_record(disposition=ProviderEffectDisposition.COMMITTED)
    with pytest.raises(JobExecutionStateInvariantError, match="complete settlement evidence"):
        ProviderEffectSnapshot.from_record(terminal)


def test_active_snapshot_rejects_terminal_evidence() -> None:
    active = _effect_record()
    active.settled_at = datetime.now(tz=UTC)
    active.settled_by_attempt_id = uuid4()
    active.settlement_reference = {"marker": "committed"}

    with pytest.raises(JobExecutionStateInvariantError, match="cannot carry settlement evidence"):
        ProviderEffectSnapshot.from_record(active)
