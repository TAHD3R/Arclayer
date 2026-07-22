from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.models.jobs.background_job import JobWorkloadClass
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.assets.jobs.thumbnail_pipeline import AssetThumbnailPipeline, AssetThumbnailPipelineOperation
from src.modules.assets.jobs.thumbnail_provider_effect_coordinator import (
    AssetThumbnailProviderEffectEvidence,
    AssetThumbnailProviderEffectRecoveryBatch,
    AssetThumbnailProviderEffectRecoveryCoordinator,
)
from src.modules.assets.jobs.thumbnail_provider_effects import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailProviderEffectCleanedReferenceV1,
    AssetThumbnailProviderEffectManifestV1,
    AssetThumbnailProviderOutputV1,
    build_asset_thumbnail_output_identity,
)
from src.modules.assets.jobs.thumbnail_provider_storage import ExactAssetThumbnailProviderStorageResolver
from src.modules.assets.jobs.thumbnail_recovery_handler import (
    AssetThumbnailProviderEffectRecoveryHandler,
)
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.execution_schema import JobExecutionLease
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_recovery import (
    ProviderEffectRecoveryInput,
    ProviderEffectRecoveryTarget,
)
from src.modules.jobs.provider_effect_schema import ProviderEffectSnapshot
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_routes import StorageProfileRoute, StorageProfileRouteBinding

pytestmark = pytest.mark.unit

_NOW = datetime(2026, 7, 18, 12, tzinfo=UTC)


class _Context:
    def __init__(self, *, source_job_id: UUID) -> None:
        self.lease = JobExecutionLease(
            job_id=uuid4(),
            attempt_id=uuid4(),
            dispatch_sequence=1,
            attempt_number=1,
            worker_id="maintenance-worker",
            fencing_token=uuid4(),
            job_type="provider.effect.orphan.reconcile",
            job_type_version=1,
            workload_class=JobWorkloadClass.MAINTENANCE,
            claimed_at=_NOW,
            lease_until=_NOW + timedelta(seconds=60),
        )
        payload = {
            "source_job_id": source_job_id,
            "effect_type": ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
            "schema_version": ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
        }
        self.target = ProviderEffectRecoveryTarget(**payload)
        self.input_reference = ProviderEffectRecoveryInput(**payload)
        self.source_revision = "effect-recovery:test"
        self.request_fingerprint = "f" * 64
        self.progress = []

    def idempotency_key(self, *, step: str) -> str:
        return f"recovery:{step}"

    async def checkpoint(self):  # type: ignore[no-untyped-def]
        return SimpleNamespace(cancellation_requested=False)

    async def report_progress(self, update):  # type: ignore[no-untyped-def]
        self.progress.append(update)
        return SimpleNamespace(cancellation_requested=False)

    async def run_fenced_domain_commit(self, operation):  # type: ignore[no-untyped-def]
        return await operation()


class _Repository:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, UUID, UUID]] = []

    async def get_outcome_marker(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        asset_id: UUID,
    ):  # type: ignore[no-untyped-def]
        self.calls.append((workspace_id, project_id, asset_id))
        return None


class _Effects:
    def __init__(self, *, batch: AssetThumbnailProviderEffectRecoveryBatch) -> None:
        self.batch = batch
        self.events: list[object] = []

    async def list_effects(self, *, lease, source_job_id):  # type: ignore[no-untyped-def]
        _ = lease
        assert source_job_id == self.batch.source_job_id
        self.events.append("list")
        return self.batch

    async def settle_cleaned(self, *, lease, source_job_id, evidence):  # type: ignore[no-untyped-def]
        reference = AssetThumbnailProviderEffectCleanedReferenceV1(
            effect_id=evidence.effect.id,
            manifest_hash=evidence.effect.manifest_hash,
            output_identity=evidence.output_identity,
        )
        settled = evidence.model_copy(
            update={
                "effect": evidence.effect.model_copy(
                    update={
                        "disposition": ProviderEffectDisposition.CLEANED,
                        "settled_at": _NOW,
                        "settled_by_attempt_id": lease.attempt_id,
                        "settlement_reference": reference.model_dump(mode="json", by_alias=False),
                    }
                )
            }
        )
        self.events.append(("cleaned", evidence.effect.id))
        self.batch = self.batch.model_copy(update={"effects": (settled,)})
        return settled


class _Pipeline:
    def __init__(self, *, events: list[object]) -> None:
        self.events = events

    async def delete_effect_outputs(self, *, provider, outputs, control):  # type: ignore[no-untyped-def]
        _ = provider
        await control.checkpoint()
        self.events.append(("delete", tuple(output.object_key for output in outputs)))

    async def remove_job_scratch(self, *, job_id: UUID) -> None:
        self.events.append(("scratch", job_id))


class _Storage:
    def __init__(self, *, events: list[object]) -> None:
        self.events = events

    async def resolve_effect_cleanup(self, *, effect, manifest):  # type: ignore[no-untyped-def]
        _ = manifest
        self.events.append(("preflight", effect.id))
        return SimpleNamespace(provider=object())


async def test_missing_marker_routes_through_source_project_then_cleans_active_effect() -> None:
    source_job_id = uuid4()
    workspace_id = uuid4()
    project_id = uuid4()
    asset_id = uuid4()
    context = _Context(source_job_id=source_job_id)
    evidence = _evidence(
        source_job_id=source_job_id,
        project_id=project_id,
        asset_id=asset_id,
    )
    effects = _Effects(
        batch=AssetThumbnailProviderEffectRecoveryBatch(
            source_job_id=source_job_id,
            workspace_id=workspace_id,
            project_id=project_id,
            effects=(evidence,),
        )
    )
    repository = _Repository()
    pipeline = _Pipeline(events=effects.events)
    handler = AssetThumbnailProviderEffectRecoveryHandler(
        repository=repository,
        pipeline=cast(AssetThumbnailPipeline, pipeline),
        effects=cast(AssetThumbnailProviderEffectRecoveryCoordinator, effects),
        storage=cast(
            ExactAssetThumbnailProviderStorageResolver,
            _Storage(events=effects.events),
        ),
    )

    result = await handler.execute(context=_as_context(context))

    assert repository.calls == [(workspace_id, project_id, asset_id)]
    assert effects.events == [
        "list",
        ("preflight", evidence.effect.id),
        ("delete", (evidence.manifest.outputs[0].object_key,)),
        ("cleaned", evidence.effect.id),
        ("scratch", source_job_id),
        "list",
    ]
    assert result.cleaned_effect_ids == (evidence.effect.id,)
    assert result.committed_effect_ids == ()


def _as_context(
    context: _Context,
) -> JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput]:
    return cast(JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput], context)


def _evidence(
    *,
    source_job_id: UUID,
    project_id: UUID,
    asset_id: UUID,
) -> AssetThumbnailProviderEffectEvidence:
    route = StorageProfileRouteBinding(
        profile_id=uuid4(),
        profile_revision_id=uuid4(),
        route_hash="a" * 64,
        route=StorageProfileRoute(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir="/tmp/arclayer-thumbnail-recovery-tests",
        ),
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=source_job_id,
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    output = AssetThumbnailProviderOutputV1(
        width=400,
        object_key=f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{source_job_id}/thumb-400.jpg",
    )
    manifest = AssetThumbnailProviderEffectManifestV1(
        job_id=source_job_id,
        project_id=project_id,
        asset_id=asset_id,
        request_fingerprint="b" * 64,
        source_revision="c" * 64,
        thumbnail_profile_version=1,
        target_bucket=None,
        outputs=(output,),
    )
    manifest_json = manifest.model_dump(mode="json", by_alias=False)
    effect = ProviderEffectSnapshot(
        id=uuid4(),
        job_id=source_job_id,
        owner_attempt_id=operation.attempt_id,
        profile_id=route.profile_id,
        profile_revision_id=route.profile_revision_id,
        effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
        effect_key=ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
        schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
        manifest=manifest_json,
        manifest_hash=hash_json(manifest_json),
        disposition=ProviderEffectDisposition.ACTIVE,
        registered_at=_NOW,
    )
    return AssetThumbnailProviderEffectEvidence(
        effect=effect,
        manifest=manifest,
        output_identity=build_asset_thumbnail_output_identity(effect=effect, manifest=manifest),
    )
