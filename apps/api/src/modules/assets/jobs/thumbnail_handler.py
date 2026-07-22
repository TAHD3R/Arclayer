from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
    ASSET_THUMBNAIL_PROFILE_VERSION,
    ASSET_THUMBNAIL_PROFILE_WIDTHS,
    ASSET_THUMBNAIL_SOURCE_STALE_CODE,
    ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
    AssetThumbnailOutcomeMarker,
    build_asset_thumbnail_source_revision,
)
from src.modules.assets.jobs.thumbnail_pipeline import (
    AssetThumbnailPipeline,
    AssetThumbnailPipelineControl,
    AssetThumbnailPipelineOperation,
    AssetThumbnailPipelineResult,
    AssetThumbnailSource,
)
from src.modules.assets.jobs.thumbnail_provider_effect_coordinator import (
    AssetThumbnailProviderEffectCoordinator,
    AssetThumbnailProviderEffectEvidence,
)
from src.modules.assets.jobs.thumbnail_provider_effects import (
    AssetThumbnailProviderEffectManifestV1,
    AssetThumbnailProviderOutputV1,
)
from src.modules.assets.jobs.thumbnail_provider_storage import (
    ExactAssetThumbnailProviderStorageResolver,
    ResolvedAssetThumbnailEffectCleanupStorage,
)
from src.modules.assets.jobs.thumbnail_repository import AssetThumbnailOutcomeWrite
from src.modules.jobs.execution_errors import (
    JobExecutionStateInvariantError,
    PermanentJobExecutionError,
)
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.platform.storage.profile_routes import StorageProfileRouteBinding


class AssetThumbnailOutcomeRepository(Protocol):
    async def get_outcome_marker(
        self,
        *,
        project_id: UUID,
        asset_id: UUID,
    ) -> AssetThumbnailOutcomeMarker | None: ...

    async def get_source(
        self,
        *,
        project_id: UUID,
        asset_id: UUID,
    ) -> AssetThumbnailSource: ...

    async def commit_outcome(
        self,
        *,
        write: AssetThumbnailOutcomeWrite,
    ) -> AssetThumbnailOutcomeMarker: ...


class AssetThumbnailJobHandler:
    """Marker-first durable handler over normalized, exact-route provider effects."""

    __slots__ = ("_effects", "_pipeline", "_repository", "_storage")

    def __init__(
        self,
        *,
        repository: AssetThumbnailOutcomeRepository,
        pipeline: AssetThumbnailPipeline,
        effects: AssetThumbnailProviderEffectCoordinator,
        storage: ExactAssetThumbnailProviderStorageResolver,
    ) -> None:
        self._repository = repository
        self._pipeline = pipeline
        self._effects = effects
        self._storage = storage

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult | None:
        marker = await self._read_marker(context=context)
        if marker is not None and marker.job_id == context.lease.job_id:
            _require_marker_context(marker=marker, context=context)
        evidence = await self._effects.list_effects(lease=context.lease)
        if marker is not None and marker.job_id == context.lease.job_id:
            return await self._reconcile_matching_marker(
                marker=marker,
                evidence=evidence,
                context=context,
            )
        await self._cleanup_without_marker(evidence=evidence, context=context)
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult:
        await _report_progress(context=context, phase="resolving", completed=0)
        source = await self._repository.get_source(
            project_id=context.target.project_id,
            asset_id=context.input_reference.asset_id,
        )
        source_revision = _validate_source_context(source=source, context=context)
        operation = AssetThumbnailPipelineOperation(
            job_id=context.lease.job_id,
            attempt_id=context.lease.attempt_id,
            asset_id=context.input_reference.asset_id,
            project_id=context.target.project_id,
            thumbnail_profile_version=context.input_reference.thumbnail_profile_version,
            requested_widths=ASSET_THUMBNAIL_PROFILE_WIDTHS,
            idempotency_key=context.idempotency_key(step="thumbnail-pipeline"),
        )
        control = _ContextPipelineControl(context=context, effects=self._effects)
        pipeline_result = await self._pipeline.execute(
            source=source,
            operation=operation,
            control=control,
        )
        control.require_pipeline_result(pipeline_result)
        marker = await self._commit_pipeline_outcome(
            context=context,
            source_revision=source_revision,
            pipeline_result=pipeline_result,
        )
        evidence = await self._effects.list_effects(lease=context.lease)
        return await self._reconcile_matching_marker(
            marker=marker,
            evidence=evidence,
            context=context,
        )

    async def cancel(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> None:
        await self.reconcile(context=context)

    async def _read_marker(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailOutcomeMarker | None:
        try:
            return await self._repository.get_outcome_marker(
                project_id=context.target.project_id,
                asset_id=context.input_reference.asset_id,
            )
        except PermanentJobExecutionError as error:
            if error.code != ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE:
                raise
            return None

    async def _reconcile_matching_marker(
        self,
        *,
        marker: AssetThumbnailOutcomeMarker,
        evidence: tuple[AssetThumbnailProviderEffectEvidence, ...],
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult:
        for item in evidence:
            _require_effect_context(evidence=item, context=context)
        live = tuple(
            item
            for item in evidence
            if item.effect.disposition in {ProviderEffectDisposition.ACTIVE, ProviderEffectDisposition.COMMITTED}
        )
        if not live:
            raise _invalid_outcome("The stored thumbnail outcome has no live Provider Effect evidence")
        for item in live:
            _require_effect_matches_marker(evidence=item, marker=marker)
        for item in live:
            if item.effect.disposition == ProviderEffectDisposition.ACTIVE:
                await self._effects.settle_committed(lease=context.lease, evidence=item)
        await self._pipeline.remove_job_scratch(job_id=context.lease.job_id)
        return _result_from_marker(asset_id=context.input_reference.asset_id, marker=marker)

    async def _cleanup_without_marker(
        self,
        *,
        evidence: tuple[AssetThumbnailProviderEffectEvidence, ...],
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> None:
        for item in evidence:
            _require_effect_context(evidence=item, context=context)
        if any(item.effect.disposition == ProviderEffectDisposition.COMMITTED for item in evidence):
            raise _invalid_outcome("Committed thumbnail Provider Effects cannot be cleaned without their marker")
        active = tuple(item for item in evidence if item.effect.disposition == ProviderEffectDisposition.ACTIVE)
        plans: list[tuple[AssetThumbnailProviderEffectEvidence, ResolvedAssetThumbnailEffectCleanupStorage]] = []
        for item in active:
            resolved = await self._storage.resolve_effect_cleanup(
                effect=item.effect,
                manifest=item.manifest,
            )
            plans.append((item, resolved))
        control = _ContextPipelineControl(context=context, effects=self._effects)
        for item, resolved in plans:
            await self._pipeline.delete_effect_outputs(
                provider=resolved.provider,
                outputs=item.manifest.outputs,
                control=control,
            )
            await self._effects.settle_cleaned(lease=context.lease, evidence=item)
        await self._pipeline.remove_job_scratch(job_id=context.lease.job_id)

    async def _commit_pipeline_outcome(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
        source_revision: str,
        pipeline_result: AssetThumbnailPipelineResult,
    ) -> AssetThumbnailOutcomeMarker:
        await _report_progress(context=context, phase="persisting", completed=4)
        write = AssetThumbnailOutcomeWrite(
            job_id=context.lease.job_id,
            project_id=context.target.project_id,
            asset_id=context.input_reference.asset_id,
            request_fingerprint=context.request_fingerprint,
            source_revision=source_revision,
            thumbnail_profile_version=context.input_reference.thumbnail_profile_version,
            output_identity=pipeline_result.output_identity,
            produced_widths=pipeline_result.produced_widths,
            variants=pipeline_result.variants,
            meta=pipeline_result.meta,
        )

        async def commit() -> AssetThumbnailOutcomeMarker:
            return await self._repository.commit_outcome(write=write)

        marker = await context.run_fenced_domain_commit(commit)
        _require_marker_context(marker=marker, context=context)
        if marker.output_identity != pipeline_result.output_identity:
            raise _invalid_outcome("The committed thumbnail marker differs from the pipeline output identity")
        return marker


class _ContextPipelineControl(AssetThumbnailPipelineControl):
    __slots__ = ("_context", "_effects", "_registered")

    def __init__(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
        effects: AssetThumbnailProviderEffectCoordinator,
    ) -> None:
        self._context = context
        self._effects = effects
        self._registered: AssetThumbnailProviderEffectEvidence | None = None

    async def checkpoint(self) -> None:
        await self._context.checkpoint()

    async def report_phase(self, phase: str, *, completed: int) -> None:
        await _report_progress(context=self._context, phase=phase, completed=completed)

    async def register_generated_outputs(
        self,
        *,
        operation: AssetThumbnailPipelineOperation,
        route: StorageProfileRouteBinding,
        target_bucket: str | None,
        outputs: tuple[AssetThumbnailProviderOutputV1, ...],
    ) -> AssetThumbnailProviderEffectEvidence:
        if self._registered is not None:
            raise JobExecutionStateInvariantError("Thumbnail pipeline cannot register outputs more than once")
        _require_operation_context(operation=operation, context=self._context)
        source_revision = self._context.source_revision
        if source_revision is None:
            raise JobExecutionStateInvariantError("Thumbnail Job is missing its canonical source revision")
        manifest = AssetThumbnailProviderEffectManifestV1(
            job_id=operation.job_id,
            project_id=operation.project_id,
            asset_id=operation.asset_id,
            request_fingerprint=self._context.request_fingerprint,
            source_revision=source_revision,
            thumbnail_profile_version=1,
            target_bucket=target_bucket,
            outputs=outputs,
        )
        self._registered = await self._effects.register_outputs(
            lease=self._context.lease,
            route=route,
            manifest=manifest,
        )
        return self._registered

    def require_pipeline_result(self, result: AssetThumbnailPipelineResult) -> None:
        registered = self._registered
        if registered is None:
            raise JobExecutionStateInvariantError("Thumbnail pipeline returned without registering its outputs")
        if result.effect_id != registered.effect.id or result.output_identity != registered.output_identity:
            raise JobExecutionStateInvariantError(
                "Thumbnail pipeline result differs from its registered Provider Effect"
            )


def _require_operation_context(
    *,
    operation: AssetThumbnailPipelineOperation,
    context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
) -> None:
    expected = (
        context.lease.job_id,
        context.lease.attempt_id,
        context.input_reference.asset_id,
        context.target.project_id,
        context.input_reference.thumbnail_profile_version,
    )
    observed = (
        operation.job_id,
        operation.attempt_id,
        operation.asset_id,
        operation.project_id,
        operation.thumbnail_profile_version,
    )
    if observed != expected:
        raise JobExecutionStateInvariantError("Thumbnail pipeline operation differs from its canonical Job context")


def _require_marker_context(
    *,
    marker: AssetThumbnailOutcomeMarker,
    context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
) -> None:
    if (
        marker.job_id != context.lease.job_id
        or marker.request_fingerprint != context.request_fingerprint
        or marker.source_revision != context.source_revision
        or marker.thumbnail_profile_version != context.input_reference.thumbnail_profile_version
    ):
        raise _invalid_outcome("The stored thumbnail outcome conflicts with the canonical Job")


def _require_effect_context(
    *,
    evidence: AssetThumbnailProviderEffectEvidence,
    context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
) -> None:
    manifest = evidence.manifest
    if (
        manifest.job_id != context.lease.job_id
        or manifest.project_id != context.target.project_id
        or manifest.asset_id != context.input_reference.asset_id
        or manifest.request_fingerprint != context.request_fingerprint
        or manifest.source_revision != context.source_revision
        or manifest.thumbnail_profile_version != context.input_reference.thumbnail_profile_version
    ):
        raise _invalid_outcome("Thumbnail Provider Effect evidence conflicts with the canonical Job")


def _require_effect_matches_marker(
    *,
    evidence: AssetThumbnailProviderEffectEvidence,
    marker: AssetThumbnailOutcomeMarker,
) -> None:
    produced_widths = tuple(output.width for output in evidence.manifest.outputs)
    if evidence.output_identity != marker.output_identity or produced_widths != marker.produced_widths:
        raise _invalid_outcome("Thumbnail Provider Effect evidence conflicts with the stored outcome")


def _validate_source_context(
    *,
    source: AssetThumbnailSource,
    context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
) -> str:
    if source.asset_id != context.input_reference.asset_id or source.project_id != context.target.project_id:
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE,
            safe_message="The thumbnail source does not belong to the canonical target",
        )
    if context.input_reference.thumbnail_profile_version != ASSET_THUMBNAIL_PROFILE_VERSION:
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_SOURCE_STALE_CODE,
            safe_message="The requested thumbnail profile is not supported",
        )
    try:
        actual_revision = build_asset_thumbnail_source_revision(
            asset_id=source.asset_id,
            checksum_sha256=source.checksum_sha256,
        )
    except ValueError as exc:
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_SOURCE_STALE_CODE,
            safe_message="The thumbnail source revision is invalid",
        ) from exc
    if context.source_revision is None or actual_revision != context.source_revision:
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_SOURCE_STALE_CODE,
            safe_message="The thumbnail source changed after Job creation",
        )
    return actual_revision


async def _report_progress(
    *,
    context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    phase: str,
    completed: int,
) -> None:
    await context.report_progress(
        JobProgressUpdate(
            phase=phase,
            progress_completed=completed,
            progress_total=5,
        )
    )


def _invalid_outcome(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
        safe_message=message,
    )


def _result_from_marker(
    *,
    asset_id: UUID,
    marker: AssetThumbnailOutcomeMarker,
) -> AssetThumbnailJobResult:
    return AssetThumbnailJobResult(
        asset_id=asset_id,
        source_revision=marker.source_revision,
        thumbnail_profile_version=marker.thumbnail_profile_version,
        produced_widths=marker.produced_widths,
        outcome_job_id=marker.job_id,
    )
