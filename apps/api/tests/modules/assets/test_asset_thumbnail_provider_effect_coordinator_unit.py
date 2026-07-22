from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.models.jobs.background_job import JobWorkloadClass
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.assets.jobs.thumbnail_provider_effect_coordinator import (
    AssetThumbnailProviderEffectCoordinator,
    AssetThumbnailProviderEffectRecoveryCoordinator,
    AssetThumbnailProviderEffectRecoveryOperations,
)
from src.modules.assets.jobs.thumbnail_provider_effects import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailProviderEffectCleanedReferenceV1,
    AssetThumbnailProviderEffectCommittedReferenceV1,
    AssetThumbnailProviderEffectManifestV1,
    AssetThumbnailProviderOutputV1,
    build_asset_thumbnail_output_identity,
)
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.execution_schema import JobExecutionControlSnapshot, JobExecutionLease
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_schema import (
    ProviderEffectRecoverySnapshot,
    ProviderEffectRegistration,
    ProviderEffectSettlement,
    ProviderEffectSnapshot,
)
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_routes import StorageProfileRoute, StorageProfileRouteBinding

pytestmark = pytest.mark.unit

_NOW = datetime(2026, 7, 18, 8, tzinfo=UTC)


class _FakeProviderEffectOperations:
    def __init__(self, *, registered: ProviderEffectSnapshot) -> None:
        self.registered = registered
        self.effects: tuple[ProviderEffectSnapshot, ...] = (registered,)
        self.registrations: list[ProviderEffectRegistration] = []
        self.settlements: list[ProviderEffectSettlement] = []

    async def register_effect(self, *, lease, registration):  # type: ignore[no-untyped-def]
        self.registrations.append(registration)
        return self.registered, _control(lease)

    async def list_effects(self, *, lease):  # type: ignore[no-untyped-def]
        return self.effects, _control(lease)

    async def settle_effects(self, *, lease, settlement):  # type: ignore[no-untyped-def]
        self.settlements.append(settlement)
        current = next(effect for effect in self.effects if effect.id in settlement.effect_ids)
        settled = current.model_copy(
            update={
                "disposition": settlement.disposition,
                "settled_at": _NOW,
                "settled_by_attempt_id": lease.attempt_id,
                "settlement_reference": settlement.settlement_reference,
            }
        )
        self.effects = tuple(settled if effect.id == settled.id else effect for effect in self.effects)
        return (settled,), _control(lease)


class _FakeProviderEffectRecoveryOperations:
    def __init__(self, *, snapshot: ProviderEffectRecoverySnapshot) -> None:
        self.snapshot = snapshot

    async def list_effects_for_recovery(self, *, lease, source_job_id, effect_type, schema_version):  # type: ignore[no-untyped-def]
        assert source_job_id == self.snapshot.source_job_id
        assert effect_type == ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE
        assert schema_version == ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION
        return self.snapshot, _control(lease)


async def test_register_outputs_persists_canonical_active_effect_before_returning_identity() -> None:
    lease = _lease()
    manifest = _manifest(job_id=lease.job_id)
    route = _route_binding()
    effect = _effect(
        lease=lease,
        route=route,
        manifest=manifest,
        disposition=ProviderEffectDisposition.ACTIVE,
    )
    operations = _FakeProviderEffectOperations(registered=effect)
    coordinator = AssetThumbnailProviderEffectCoordinator(operations=operations)

    evidence = await coordinator.register_outputs(lease=lease, route=route, manifest=manifest)

    assert operations.registrations == [
        ProviderEffectRegistration(
            route=route,
            effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
            effect_key=ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
            schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
            manifest=manifest.model_dump(mode="json", by_alias=False),
        )
    ]
    assert evidence.effect == effect
    assert evidence.manifest == manifest
    assert evidence.output_identity == build_asset_thumbnail_output_identity(effect=effect, manifest=manifest)


async def test_register_outputs_rejects_terminal_registration_replay() -> None:
    lease = _lease()
    manifest = _manifest(job_id=lease.job_id)
    route = _route_binding()
    active = _effect(lease=lease, route=route, manifest=manifest)
    committed = _terminal_effect(
        effect=active,
        disposition=ProviderEffectDisposition.COMMITTED,
        output_identity=build_asset_thumbnail_output_identity(effect=active, manifest=manifest),
    )
    coordinator = AssetThumbnailProviderEffectCoordinator(
        operations=_FakeProviderEffectOperations(registered=committed)
    )

    with pytest.raises(JobExecutionStateInvariantError, match="ACTIVE"):
        await coordinator.register_outputs(lease=lease, route=route, manifest=manifest)


async def test_list_effects_validates_terminal_reference_and_returns_all_dispositions() -> None:
    lease = _lease()
    manifest = _manifest(job_id=lease.job_id)
    route = _route_binding()
    active = _effect(lease=lease, route=route, manifest=manifest)
    output_identity = build_asset_thumbnail_output_identity(effect=active, manifest=manifest)
    committed = _terminal_effect(
        effect=active.model_copy(update={"id": uuid4(), "owner_attempt_id": uuid4()}),
        disposition=ProviderEffectDisposition.COMMITTED,
        output_identity=output_identity,
    )
    cleaned = _terminal_effect(
        effect=active.model_copy(update={"id": uuid4(), "owner_attempt_id": uuid4()}),
        disposition=ProviderEffectDisposition.CLEANED,
        output_identity=output_identity,
    )
    operations = _FakeProviderEffectOperations(registered=active)
    operations.effects = (active, committed, cleaned)
    coordinator = AssetThumbnailProviderEffectCoordinator(operations=operations)

    evidence = await coordinator.list_effects(lease=lease)

    assert tuple(item.effect.disposition for item in evidence) == (
        ProviderEffectDisposition.ACTIVE,
        ProviderEffectDisposition.COMMITTED,
        ProviderEffectDisposition.CLEANED,
    )
    assert {item.output_identity for item in evidence} == {output_identity}


async def test_list_effects_rejects_cross_row_terminal_reference_drift() -> None:
    lease = _lease()
    manifest = _manifest(job_id=lease.job_id)
    route = _route_binding()
    active = _effect(lease=lease, route=route, manifest=manifest)
    committed = _terminal_effect(
        effect=active,
        disposition=ProviderEffectDisposition.COMMITTED,
        output_identity="d" * 64,
    )
    operations = _FakeProviderEffectOperations(registered=active)
    operations.effects = (committed,)
    coordinator = AssetThumbnailProviderEffectCoordinator(operations=operations)

    with pytest.raises(JobExecutionStateInvariantError, match="not exact"):
        await coordinator.list_effects(lease=lease)


async def test_settlement_uses_byte_stable_effect_specific_reference() -> None:
    lease = _lease()
    manifest = _manifest(job_id=lease.job_id)
    route = _route_binding()
    effect = _effect(lease=lease, route=route, manifest=manifest)
    operations = _FakeProviderEffectOperations(registered=effect)
    coordinator = AssetThumbnailProviderEffectCoordinator(operations=operations)
    evidence = await coordinator.register_outputs(lease=lease, route=route, manifest=manifest)

    committed = await coordinator.settle_committed(lease=lease, evidence=evidence)

    reference = AssetThumbnailProviderEffectCommittedReferenceV1(
        effect_id=effect.id,
        manifest_hash=effect.manifest_hash,
        output_identity=evidence.output_identity,
    )
    assert operations.settlements == [
        ProviderEffectSettlement(
            effect_ids=(effect.id,),
            disposition=ProviderEffectDisposition.COMMITTED,
            settlement_reference=reference.model_dump(mode="json", by_alias=False),
        )
    ]
    assert committed.effect.disposition == ProviderEffectDisposition.COMMITTED


async def test_cleaned_settlement_uses_the_distinct_cleaned_discriminator() -> None:
    lease = _lease()
    manifest = _manifest(job_id=lease.job_id)
    route = _route_binding()
    effect = _effect(lease=lease, route=route, manifest=manifest)
    operations = _FakeProviderEffectOperations(registered=effect)
    coordinator = AssetThumbnailProviderEffectCoordinator(operations=operations)
    evidence = await coordinator.register_outputs(lease=lease, route=route, manifest=manifest)

    cleaned = await coordinator.settle_cleaned(lease=lease, evidence=evidence)

    reference = AssetThumbnailProviderEffectCleanedReferenceV1(
        effect_id=effect.id,
        manifest_hash=effect.manifest_hash,
        output_identity=evidence.output_identity,
    )
    assert operations.settlements[-1].settlement_reference == reference.model_dump(
        mode="json",
        by_alias=False,
    )
    assert cleaned.effect.disposition == ProviderEffectDisposition.CLEANED


async def test_recovery_listing_preserves_the_exact_source_project_scope() -> None:
    source_lease = _lease()
    recovery_lease = _lease().model_copy(
        update={
            "job_id": uuid4(),
            "attempt_id": uuid4(),
            "job_type": "provider.effect.orphan.reconcile",
            "workload_class": JobWorkloadClass.MAINTENANCE,
        }
    )
    manifest = _manifest(job_id=source_lease.job_id)
    effect = _effect(
        lease=source_lease,
        route=_route_binding(),
        manifest=manifest,
    )
    workspace_id = uuid4()
    snapshot = ProviderEffectRecoverySnapshot(
        source_job_id=source_lease.job_id,
        workspace_id=workspace_id,
        project_id=manifest.project_id,
        effects=(effect,),
    )
    coordinator = AssetThumbnailProviderEffectRecoveryCoordinator(
        operations=cast(
            AssetThumbnailProviderEffectRecoveryOperations,
            _FakeProviderEffectRecoveryOperations(snapshot=snapshot),
        )
    )

    batch = await coordinator.list_effects(
        lease=recovery_lease,
        source_job_id=source_lease.job_id,
    )

    assert batch.workspace_id == workspace_id
    assert batch.project_id == manifest.project_id
    assert tuple(item.effect.id for item in batch.effects) == (effect.id,)


def _lease() -> JobExecutionLease:
    return JobExecutionLease(
        job_id=uuid4(),
        attempt_id=uuid4(),
        dispatch_sequence=1,
        attempt_number=1,
        worker_id="asset-worker",
        fencing_token=uuid4(),
        job_type="asset.thumbnail.generate",
        job_type_version=1,
        workload_class=JobWorkloadClass.ASSET_CPU,
        claimed_at=_NOW,
        lease_until=_NOW + timedelta(seconds=60),
    )


def _control(lease: JobExecutionLease) -> JobExecutionControlSnapshot:
    return JobExecutionControlSnapshot(
        job_id=lease.job_id,
        attempt_id=lease.attempt_id,
        fencing_token=lease.fencing_token,
        observed_at=_NOW,
        lease_until=_NOW + timedelta(seconds=60),
    )


def _route_binding() -> StorageProfileRouteBinding:
    return StorageProfileRouteBinding(
        profile_id=uuid4(),
        profile_revision_id=uuid4(),
        route_hash="a" * 64,
        route=StorageProfileRoute(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir="/tmp/arclayer-thumbnail-tests",
        ),
    )


def _manifest(*, job_id: UUID) -> AssetThumbnailProviderEffectManifestV1:
    project_id = uuid4()
    asset_id = uuid4()
    return AssetThumbnailProviderEffectManifestV1(
        job_id=job_id,
        project_id=project_id,
        asset_id=asset_id,
        request_fingerprint="b" * 64,
        source_revision="c" * 64,
        thumbnail_profile_version=1,
        target_bucket=None,
        outputs=(
            AssetThumbnailProviderOutputV1(
                width=320,
                object_key=(f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}/thumb-320.jpg"),
            ),
        ),
    )


def _effect(
    *,
    lease: JobExecutionLease,
    route: StorageProfileRouteBinding,
    manifest: AssetThumbnailProviderEffectManifestV1,
    disposition: ProviderEffectDisposition = ProviderEffectDisposition.ACTIVE,
) -> ProviderEffectSnapshot:
    manifest_json = manifest.model_dump(mode="json", by_alias=False)
    return ProviderEffectSnapshot(
        id=uuid4(),
        job_id=lease.job_id,
        owner_attempt_id=lease.attempt_id,
        profile_id=route.profile_id,
        profile_revision_id=route.profile_revision_id,
        effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
        effect_key=ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
        schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
        manifest=manifest_json,
        manifest_hash=hash_json(manifest_json),
        disposition=disposition,
        registered_at=_NOW,
    )


def _terminal_effect(
    *,
    effect: ProviderEffectSnapshot,
    disposition: ProviderEffectDisposition,
    output_identity: str,
) -> ProviderEffectSnapshot:
    reference_model = (
        AssetThumbnailProviderEffectCommittedReferenceV1
        if disposition == ProviderEffectDisposition.COMMITTED
        else AssetThumbnailProviderEffectCleanedReferenceV1
    )
    reference = reference_model(
        effect_id=effect.id,
        manifest_hash=effect.manifest_hash,
        output_identity=output_identity,
    )
    return effect.model_copy(
        update={
            "disposition": disposition,
            "settled_at": _NOW,
            "settled_by_attempt_id": uuid4(),
            "settlement_reference": reference.model_dump(mode="json", by_alias=False),
        }
    )
