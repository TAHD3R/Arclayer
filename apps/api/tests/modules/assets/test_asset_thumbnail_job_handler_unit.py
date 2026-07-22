from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobTarget,
    AssetThumbnailOutcomeMarker,
)
from src.modules.assets.jobs.thumbnail_handler import AssetThumbnailJobHandler
from src.modules.assets.jobs.thumbnail_pipeline import (
    AssetThumbnailPipelineOperation,
    AssetThumbnailPipelineResult,
    AssetThumbnailSource,
)
from src.modules.assets.jobs.thumbnail_provider_effect_coordinator import (
    AssetThumbnailProviderEffectEvidence,
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
from src.modules.assets.jobs.thumbnail_repository import AssetThumbnailOutcomeWrite
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError, PermanentJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_schema import ProviderEffectSnapshot
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_routes import StorageProfileRoute, StorageProfileRouteBinding

pytestmark = pytest.mark.unit

_NOW = datetime(2026, 7, 18, 9, tzinfo=UTC)


class _Context:
    def __init__(self, *, job_id: UUID, project_id: UUID, asset_id: UUID) -> None:
        self.lease = SimpleNamespace(
            job_id=job_id,
            attempt_id=uuid4(),
            attempt_number=1,
        )
        self.target = AssetThumbnailJobTarget(
            workspace_id=uuid4(),
            project_id=project_id,
            entity_id=asset_id,
        )
        self.input_reference = AssetThumbnailJobInput(
            asset_id=asset_id,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        )
        self.source_revision = "a" * 64
        self.request_fingerprint = "f" * 64
        self.progress = []
        self.fenced_commits = 0

    def idempotency_key(self, *, step: str) -> str:
        assert step == "thumbnail-pipeline"
        return "d" * 64

    async def checkpoint(self):  # type: ignore[no-untyped-def]
        return SimpleNamespace(cancellation_requested=False)

    async def report_progress(self, update):  # type: ignore[no-untyped-def]
        self.progress.append(update)
        return SimpleNamespace(cancellation_requested=False)

    async def run_fenced_domain_commit(self, operation):  # type: ignore[no-untyped-def]
        self.fenced_commits += 1
        return await operation()


class _Repository:
    def __init__(
        self,
        *,
        marker: AssetThumbnailOutcomeMarker | None,
        source: AssetThumbnailSource,
        target_missing: bool = False,
    ) -> None:
        self.marker = marker
        self.source = source
        self.target_missing = target_missing
        self.writes: list[AssetThumbnailOutcomeWrite] = []

    async def get_outcome_marker(self, *, project_id: UUID, asset_id: UUID):  # type: ignore[no-untyped-def]
        _ = project_id, asset_id
        if self.target_missing:
            raise PermanentJobExecutionError(
                code="ASSET_THUMBNAIL_TARGET_NOT_FOUND",
                safe_message="missing",
            )
        return self.marker

    async def get_source(self, *, project_id: UUID, asset_id: UUID) -> AssetThumbnailSource:
        assert (project_id, asset_id) == (self.source.project_id, self.source.asset_id)
        return self.source

    async def commit_outcome(self, *, write: AssetThumbnailOutcomeWrite) -> AssetThumbnailOutcomeMarker:
        self.writes.append(write)
        self.marker = AssetThumbnailOutcomeMarker(
            job_id=write.job_id,
            request_fingerprint=write.request_fingerprint,
            output_identity=write.output_identity,
            source_revision=write.source_revision,
            thumbnail_profile_version=write.thumbnail_profile_version,
            produced_widths=write.produced_widths,
            completed_at=_NOW,
        )
        return self.marker


class _Effects:
    def __init__(
        self,
        *,
        effects: tuple[AssetThumbnailProviderEffectEvidence, ...] = (),
        events: list[object] | None = None,
    ) -> None:
        self.effects = effects
        self.events = events if events is not None else []

    async def list_effects(self, *, lease):  # type: ignore[no-untyped-def]
        self.events.append("list-effects")
        assert all(item.effect.job_id == lease.job_id for item in self.effects)
        return self.effects

    async def register_outputs(self, *, lease, route, manifest):  # type: ignore[no-untyped-def]
        self.events.append("register")
        evidence = _evidence(
            context=SimpleNamespace(lease=lease),
            manifest=manifest,
            route=route,
        )
        self.effects = (*self.effects, evidence)
        return evidence

    async def settle_committed(self, *, lease, evidence):  # type: ignore[no-untyped-def]
        self.events.append(("committed", evidence.effect.id))
        settled = _terminal_evidence(evidence, ProviderEffectDisposition.COMMITTED)
        self._replace(settled)
        return settled

    async def settle_cleaned(self, *, lease, evidence):  # type: ignore[no-untyped-def]
        self.events.append(("cleaned", evidence.effect.id))
        settled = _terminal_evidence(evidence, ProviderEffectDisposition.CLEANED)
        self._replace(settled)
        return settled

    def _replace(self, replacement: AssetThumbnailProviderEffectEvidence) -> None:
        self.effects = tuple(replacement if item.effect.id == replacement.effect.id else item for item in self.effects)


class _Pipeline:
    def __init__(
        self,
        *,
        route: StorageProfileRouteBinding,
        events: list[object] | None = None,
        mismatched_result: bool = False,
    ) -> None:
        self.route = route
        self.events = events if events is not None else []
        self.mismatched_result = mismatched_result
        self.execute_calls = 0

    async def execute(self, *, source, operation, control):  # type: ignore[no-untyped-def]
        self.execute_calls += 1
        output = _output(operation)
        evidence = await control.register_generated_outputs(
            operation=operation,
            route=self.route,
            target_bucket=None,
            outputs=(output,),
        )
        return AssetThumbnailPipelineResult(
            effect_id=uuid4() if self.mismatched_result else evidence.effect.id,
            output_identity=evidence.output_identity,
            produced_widths=(output.width,),
            variants={
                "thumbnails": [
                    {
                        "width": output.width,
                        "object_key": output.object_key,
                        "mime": "image/jpeg",
                    }
                ]
            },
            meta={"thumbnail": {"profile_version": 1}},
        )

    async def delete_effect_outputs(self, *, provider, outputs, control):  # type: ignore[no-untyped-def]
        _ = provider, control
        self.events.append(("delete", tuple(output.object_key for output in outputs)))

    async def remove_job_scratch(self, *, job_id: UUID) -> None:
        self.events.append(("scratch", job_id))


class _Storage:
    def __init__(self, *, events: list[object], fail_on_preflight: int | None = None) -> None:
        self.events = events
        self.fail_on_preflight = fail_on_preflight
        self.calls = 0

    async def resolve_effect_cleanup(self, *, effect, manifest):  # type: ignore[no-untyped-def]
        _ = manifest
        self.calls += 1
        self.events.append(("preflight", effect.id))
        if self.fail_on_preflight == self.calls:
            raise RuntimeError("cleanup preflight failed")
        return SimpleNamespace(provider=object())


async def test_matching_marker_commits_active_effects_without_resolving_cleanup_storage() -> None:
    context, source, route = _fixture_context()
    active = _evidence(context=context, manifest=_manifest(context), route=route)
    committed = _terminal_evidence(
        _evidence(context=context, manifest=_manifest(context), route=route, effect_id=uuid4()),
        ProviderEffectDisposition.COMMITTED,
    )
    cleaned = _terminal_evidence(
        _evidence(context=context, manifest=_manifest(context), route=route, effect_id=uuid4()),
        ProviderEffectDisposition.CLEANED,
    )
    marker = _marker(context=context, evidence=active)
    events: list[object] = []
    effects = _Effects(effects=(active, committed, cleaned), events=events)
    pipeline = _Pipeline(route=route, events=events)
    storage = _Storage(events=events)
    handler = _handler(
        repository=_Repository(marker=marker, source=source),
        pipeline=pipeline,
        effects=effects,
        storage=storage,
    )

    result = await handler.reconcile(context=_as_handler_context(context))

    assert result is not None and result.outcome_job_id == context.lease.job_id
    assert events == [
        "list-effects",
        ("committed", active.effect.id),
        ("scratch", context.lease.job_id),
    ]
    assert storage.calls == 0
    assert pipeline.execute_calls == 0


@pytest.mark.parametrize("conflict", ["no-live-effect", "identity-drift", "width-drift"])
async def test_matching_marker_fails_closed_before_mutation_when_evidence_conflicts(conflict: str) -> None:
    context, source, route = _fixture_context()
    active = _evidence(context=context, manifest=_manifest(context), route=route)
    marker = _marker(context=context, evidence=active)
    evidence = (
        (_terminal_evidence(active, ProviderEffectDisposition.CLEANED),) if conflict == "no-live-effect" else (active,)
    )
    if conflict == "identity-drift":
        marker = marker.model_copy(update={"output_identity": "e" * 64})
    if conflict == "width-drift":
        marker = marker.model_copy(update={"produced_widths": (800,)})
    events: list[object] = []
    handler = _handler(
        repository=_Repository(marker=marker, source=source),
        pipeline=_Pipeline(route=route, events=events),
        effects=_Effects(effects=evidence, events=events),
        storage=_Storage(events=events),
    )

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await handler.reconcile(context=_as_handler_context(context))

    assert exc_info.value.code == ASSET_THUMBNAIL_OUTCOME_INVALID_CODE
    assert not any(
        isinstance(event, tuple) and event[0] in {"committed", "cleaned", "delete", "scratch"} for event in events
    )


async def test_missing_marker_rejects_committed_effect_before_cleanup_preflight() -> None:
    context, source, route = _fixture_context()
    committed = _terminal_evidence(
        _evidence(context=context, manifest=_manifest(context), route=route),
        ProviderEffectDisposition.COMMITTED,
    )
    events: list[object] = []
    storage = _Storage(events=events)
    handler = _handler(
        repository=_Repository(marker=None, source=source),
        pipeline=_Pipeline(route=route, events=events),
        effects=_Effects(effects=(committed,), events=events),
        storage=storage,
    )

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await handler.reconcile(context=_as_handler_context(context))

    assert exc_info.value.code == ASSET_THUMBNAIL_OUTCOME_INVALID_CODE
    assert storage.calls == 0
    assert events == ["list-effects"]


async def test_missing_marker_preflights_every_active_effect_before_first_delete() -> None:
    context, source, route = _fixture_context()
    first = _evidence(context=context, manifest=_manifest(context), route=route)
    second = _evidence(context=context, manifest=_manifest(context), route=route, effect_id=uuid4())
    events: list[object] = []
    handler = _handler(
        repository=_Repository(marker=None, source=source),
        pipeline=_Pipeline(route=route, events=events),
        effects=_Effects(effects=(first, second), events=events),
        storage=_Storage(events=events),
    )

    assert await handler.reconcile(context=_as_handler_context(context)) is None

    assert events[:3] == [
        "list-effects",
        ("preflight", first.effect.id),
        ("preflight", second.effect.id),
    ]
    assert events[3:] == [
        ("delete", (first.manifest.outputs[0].object_key,)),
        ("cleaned", first.effect.id),
        ("delete", (second.manifest.outputs[0].object_key,)),
        ("cleaned", second.effect.id),
        ("scratch", context.lease.job_id),
    ]


async def test_cleanup_preflight_failure_performs_zero_deletes_and_zero_settlements() -> None:
    context, source, route = _fixture_context()
    effects_tuple = (
        _evidence(context=context, manifest=_manifest(context), route=route),
        _evidence(context=context, manifest=_manifest(context), route=route, effect_id=uuid4()),
    )
    events: list[object] = []
    handler = _handler(
        repository=_Repository(marker=None, source=source),
        pipeline=_Pipeline(route=route, events=events),
        effects=_Effects(effects=effects_tuple, events=events),
        storage=_Storage(events=events, fail_on_preflight=2),
    )

    with pytest.raises(RuntimeError, match="preflight failed"):
        await handler.reconcile(context=_as_handler_context(context))

    assert not any(isinstance(event, tuple) and event[0] in {"delete", "cleaned", "scratch"} for event in events)


@pytest.mark.parametrize("target_missing", [False, True])
async def test_zero_active_effects_still_remove_the_job_scratch_root(target_missing: bool) -> None:
    context, source, route = _fixture_context()
    events: list[object] = []
    handler = _handler(
        repository=_Repository(marker=None, source=source, target_missing=target_missing),
        pipeline=_Pipeline(route=route, events=events),
        effects=_Effects(events=events),
        storage=_Storage(events=events),
    )

    assert await handler.reconcile(context=_as_handler_context(context)) is None

    assert events == ["list-effects", ("scratch", context.lease.job_id)]


async def test_execute_commits_output_identity_then_converges_active_effect_to_committed() -> None:
    context, source, route = _fixture_context()
    events: list[object] = []
    repository = _Repository(marker=None, source=source)
    effects = _Effects(events=events)
    pipeline = _Pipeline(route=route, events=events)
    handler = _handler(
        repository=repository,
        pipeline=pipeline,
        effects=effects,
        storage=_Storage(events=events),
    )

    result = await handler.execute(context=_as_handler_context(context))

    assert result.outcome_job_id == context.lease.job_id
    assert context.fenced_commits == 1
    assert len(repository.writes) == 1
    assert repository.writes[0].output_identity == effects.effects[0].output_identity
    assert events == [
        "register",
        "list-effects",
        ("committed", effects.effects[0].effect.id),
        ("scratch", context.lease.job_id),
    ]


async def test_execute_rejects_pipeline_result_that_differs_from_registered_effect_before_marker_commit() -> None:
    context, source, route = _fixture_context()
    repository = _Repository(marker=None, source=source)
    handler = _handler(
        repository=repository,
        pipeline=_Pipeline(route=route, mismatched_result=True),
        effects=_Effects(),
        storage=_Storage(events=[]),
    )

    with pytest.raises(JobExecutionStateInvariantError, match="differs"):
        await handler.execute(context=_as_handler_context(context))

    assert repository.writes == []
    assert context.fenced_commits == 0


def _handler(*, repository, pipeline, effects, storage) -> AssetThumbnailJobHandler:  # type: ignore[no-untyped-def]
    return AssetThumbnailJobHandler(
        repository=repository,
        pipeline=pipeline,
        effects=effects,
        storage=storage,
    )


def _as_handler_context(
    context: _Context,
) -> JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput]:
    return cast(JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput], context)


def _fixture_context() -> tuple[_Context, AssetThumbnailSource, StorageProfileRouteBinding]:
    project_id = uuid4()
    asset_id = uuid4()
    context = _Context(job_id=uuid4(), project_id=project_id, asset_id=asset_id)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/jpeg",
        ext="jpg",
        checksum_sha256="a" * 64,
        storage_provider=ObjectStorageProviderKind.LOCAL,
        storage_profile_key="env-default",
        object_key=f"projects/{project_id}/assets/{asset_id}/source.jpg",
    )
    route = StorageProfileRouteBinding(
        profile_id=uuid4(),
        profile_revision_id=uuid4(),
        route_hash="b" * 64,
        route=StorageProfileRoute(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir="/tmp/arclayer-handler-tests",
        ),
    )
    return context, source, route


def _manifest(context: _Context) -> AssetThumbnailProviderEffectManifestV1:
    operation = AssetThumbnailPipelineOperation(
        job_id=context.lease.job_id,
        attempt_id=context.lease.attempt_id,
        asset_id=context.input_reference.asset_id,
        project_id=context.target.project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    return AssetThumbnailProviderEffectManifestV1(
        job_id=operation.job_id,
        project_id=operation.project_id,
        asset_id=operation.asset_id,
        request_fingerprint=context.request_fingerprint,
        source_revision=cast(str, context.source_revision),
        thumbnail_profile_version=1,
        target_bucket=None,
        outputs=(_output(operation),),
    )


def _output(operation: AssetThumbnailPipelineOperation) -> AssetThumbnailProviderOutputV1:
    return AssetThumbnailProviderOutputV1(
        width=400,
        object_key=(
            f"projects/{operation.project_id}/assets/{operation.asset_id}/thumbnails/"
            f"v1/{operation.job_id}/thumb-400.jpg"
        ),
    )


def _evidence(
    *,
    context,
    manifest: AssetThumbnailProviderEffectManifestV1,
    route: StorageProfileRouteBinding,
    effect_id: UUID | None = None,
) -> AssetThumbnailProviderEffectEvidence:  # type: ignore[no-untyped-def]
    manifest_json = manifest.model_dump(mode="json", by_alias=False)
    effect = ProviderEffectSnapshot(
        id=effect_id or uuid4(),
        job_id=context.lease.job_id,
        owner_attempt_id=context.lease.attempt_id,
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


def _terminal_evidence(
    evidence: AssetThumbnailProviderEffectEvidence,
    disposition: ProviderEffectDisposition,
) -> AssetThumbnailProviderEffectEvidence:
    reference_model = (
        AssetThumbnailProviderEffectCommittedReferenceV1
        if disposition == ProviderEffectDisposition.COMMITTED
        else AssetThumbnailProviderEffectCleanedReferenceV1
    )
    reference = reference_model(
        effect_id=evidence.effect.id,
        manifest_hash=evidence.effect.manifest_hash,
        output_identity=evidence.output_identity,
    )
    effect = evidence.effect.model_copy(
        update={
            "disposition": disposition,
            "settled_at": _NOW,
            "settled_by_attempt_id": uuid4(),
            "settlement_reference": reference.model_dump(mode="json", by_alias=False),
        }
    )
    return evidence.model_copy(update={"effect": effect})


def _marker(
    *,
    context: _Context,
    evidence: AssetThumbnailProviderEffectEvidence,
) -> AssetThumbnailOutcomeMarker:
    return AssetThumbnailOutcomeMarker(
        job_id=context.lease.job_id,
        request_fingerprint=context.request_fingerprint,
        output_identity=evidence.output_identity,
        source_revision=cast(str, context.source_revision),
        thumbnail_profile_version=1,
        produced_widths=tuple(output.width for output in evidence.manifest.outputs),
        completed_at=_NOW,
    )
