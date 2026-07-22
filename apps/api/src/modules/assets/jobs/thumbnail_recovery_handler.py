from __future__ import annotations

from typing import Protocol
from uuid import UUID

from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
    ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE,
    AssetThumbnailOutcomeMarker,
)
from src.modules.assets.jobs.thumbnail_pipeline import (
    AssetThumbnailPipeline,
    AssetThumbnailPipelineControl,
    AssetThumbnailPipelineOperation,
)
from src.modules.assets.jobs.thumbnail_provider_effect_coordinator import (
    AssetThumbnailProviderEffectEvidence,
    AssetThumbnailProviderEffectRecoveryCoordinator,
)
from src.modules.assets.jobs.thumbnail_provider_effects import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailProviderOutputV1,
)
from src.modules.assets.jobs.thumbnail_provider_storage import (
    ExactAssetThumbnailProviderStorageResolver,
    ResolvedAssetThumbnailEffectCleanupStorage,
)
from src.modules.jobs.execution_errors import (
    JobExecutionStateInvariantError,
    PermanentJobExecutionError,
)
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.jobs.provider_effect_recovery import (
    ProviderEffectRecoveryInput,
    ProviderEffectRecoveryResult,
    ProviderEffectRecoveryTarget,
)
from src.platform.storage.profile_routes import StorageProfileRouteBinding


class AssetThumbnailRecoveryOutcomeRepository(Protocol):
    async def get_outcome_marker(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        asset_id: UUID,
    ) -> AssetThumbnailOutcomeMarker | None: ...


class AssetThumbnailProviderEffectRecoveryHandler:
    """Marker-first maintenance recovery for terminal Thumbnail source Jobs."""

    __slots__ = ("_effects", "_pipeline", "_repository", "_storage")

    def __init__(
        self,
        *,
        repository: AssetThumbnailRecoveryOutcomeRepository,
        pipeline: AssetThumbnailPipeline,
        effects: AssetThumbnailProviderEffectRecoveryCoordinator,
        storage: ExactAssetThumbnailProviderStorageResolver,
    ) -> None:
        self._repository = repository
        self._pipeline = pipeline
        self._effects = effects
        self._storage = storage

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput],
    ) -> ProviderEffectRecoveryResult | None:
        source_job_id = _validate_recovery_context(context)
        batch = await self._effects.list_effects(
            lease=context.lease,
            source_job_id=source_job_id,
        )
        evidence = batch.effects
        _require_source_evidence(evidence=evidence, source_job_id=source_job_id)
        if any(item.effect.disposition == ProviderEffectDisposition.ACTIVE for item in evidence):
            return None
        await context.checkpoint()
        await self._pipeline.remove_job_scratch(job_id=source_job_id)
        return _build_result(context=context, evidence=evidence)

    async def execute(
        self,
        *,
        context: JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput],
    ) -> ProviderEffectRecoveryResult:
        source_job_id = _validate_recovery_context(context)
        await _report_progress(context=context, phase="reconciling", completed=0)
        batch = await self._effects.list_effects(
            lease=context.lease,
            source_job_id=source_job_id,
        )
        evidence = batch.effects
        common = _require_source_evidence(evidence=evidence, source_job_id=source_job_id)
        marker = await self._read_marker(
            workspace_id=batch.workspace_id,
            project_id=batch.project_id,
            asset_id=common.manifest.asset_id,
        )
        if marker is not None and marker.job_id == source_job_id:
            _require_marker_context(marker=marker, evidence=common)
            await self._commit_matching_effects(
                context=context,
                source_job_id=source_job_id,
                marker=marker,
                evidence=evidence,
            )
        else:
            await self._clean_uncommitted_effects(
                context=context,
                source_job_id=source_job_id,
                evidence=evidence,
            )
        await context.checkpoint()
        await self._pipeline.remove_job_scratch(job_id=source_job_id)
        settled = await self._effects.list_effects(
            lease=context.lease,
            source_job_id=source_job_id,
        )
        return _build_result(context=context, evidence=settled.effects)

    async def _read_marker(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        asset_id: UUID,
    ) -> AssetThumbnailOutcomeMarker | None:
        try:
            return await self._repository.get_outcome_marker(
                workspace_id=workspace_id,
                project_id=project_id,
                asset_id=asset_id,
            )
        except PermanentJobExecutionError as error:
            if error.code != ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE:
                raise
            return None

    async def _commit_matching_effects(
        self,
        *,
        context: JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput],
        source_job_id: UUID,
        marker: AssetThumbnailOutcomeMarker,
        evidence: tuple[AssetThumbnailProviderEffectEvidence, ...],
    ) -> None:
        live = tuple(
            item
            for item in evidence
            if item.effect.disposition in {ProviderEffectDisposition.ACTIVE, ProviderEffectDisposition.COMMITTED}
        )
        if not live:
            raise _invalid_outcome("Stored thumbnail outcome has no live Provider Effect evidence")
        for item in live:
            _require_effect_matches_marker(evidence=item, marker=marker)
        await _report_progress(context=context, phase="settling", completed=2)
        for item in live:
            if item.effect.disposition == ProviderEffectDisposition.ACTIVE:
                await self._effects.settle_committed(
                    lease=context.lease,
                    source_job_id=source_job_id,
                    evidence=item,
                )

    async def _clean_uncommitted_effects(
        self,
        *,
        context: JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput],
        source_job_id: UUID,
        evidence: tuple[AssetThumbnailProviderEffectEvidence, ...],
    ) -> None:
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
        await _report_progress(context=context, phase="cleaning", completed=1)
        control = _RecoveryPipelineControl(context=context)
        for item, resolved in plans:
            await self._pipeline.delete_effect_outputs(
                provider=resolved.provider,
                outputs=item.manifest.outputs,
                control=control,
            )
            await self._effects.settle_cleaned(
                lease=context.lease,
                source_job_id=source_job_id,
                evidence=item,
            )


class _RecoveryPipelineControl(AssetThumbnailPipelineControl):
    __slots__ = ("_context",)

    def __init__(
        self,
        *,
        context: JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput],
    ) -> None:
        self._context = context

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
        _ = operation, route, target_bucket, outputs
        raise JobExecutionStateInvariantError("Provider Effect recovery cannot register new outputs")


def _validate_recovery_context(
    context: JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput],
) -> UUID:
    target = context.target
    input_reference = context.input_reference
    expected = (
        target.source_job_id,
        ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
        ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    )
    if expected != (
        input_reference.source_job_id,
        input_reference.effect_type,
        input_reference.schema_version,
    ) or expected != (
        target.source_job_id,
        target.effect_type,
        target.schema_version,
    ):
        raise JobExecutionStateInvariantError("Thumbnail recovery context has another Provider Effect contract")
    return target.source_job_id


def _require_source_evidence(
    *,
    evidence: tuple[AssetThumbnailProviderEffectEvidence, ...],
    source_job_id: UUID,
) -> AssetThumbnailProviderEffectEvidence:
    if not evidence:
        raise _invalid_outcome("Thumbnail recovery source Job has no Provider Effect evidence")
    common = evidence[0]
    expected = _manifest_context(common)
    for item in evidence:
        if item.effect.job_id != source_job_id or item.manifest.job_id != source_job_id:
            raise _invalid_outcome("Thumbnail recovery evidence belongs to another source Job")
        if _manifest_context(item) != expected:
            raise _invalid_outcome("Thumbnail recovery evidence has conflicting source context")
    return common


def _manifest_context(evidence: AssetThumbnailProviderEffectEvidence) -> tuple[object, ...]:
    manifest = evidence.manifest
    return (
        manifest.project_id,
        manifest.asset_id,
        manifest.request_fingerprint,
        manifest.source_revision,
        manifest.thumbnail_profile_version,
    )


def _require_marker_context(
    *,
    marker: AssetThumbnailOutcomeMarker,
    evidence: AssetThumbnailProviderEffectEvidence,
) -> None:
    manifest = evidence.manifest
    if (
        marker.job_id != manifest.job_id
        or marker.request_fingerprint != manifest.request_fingerprint
        or marker.source_revision != manifest.source_revision
        or marker.thumbnail_profile_version != manifest.thumbnail_profile_version
    ):
        raise _invalid_outcome("Stored thumbnail outcome conflicts with recovery evidence")


def _require_effect_matches_marker(
    *,
    evidence: AssetThumbnailProviderEffectEvidence,
    marker: AssetThumbnailOutcomeMarker,
) -> None:
    produced_widths = tuple(output.width for output in evidence.manifest.outputs)
    if evidence.output_identity != marker.output_identity or produced_widths != marker.produced_widths:
        raise _invalid_outcome("Thumbnail recovery evidence conflicts with the stored outcome")


def _build_result(
    *,
    context: JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput],
    evidence: tuple[AssetThumbnailProviderEffectEvidence, ...],
) -> ProviderEffectRecoveryResult:
    _require_source_evidence(evidence=evidence, source_job_id=context.target.source_job_id)
    if any(item.effect.disposition == ProviderEffectDisposition.ACTIVE for item in evidence):
        raise _invalid_outcome("Thumbnail recovery cannot complete with ACTIVE Provider Effects")
    effect_ids = tuple(sorted((item.effect.id for item in evidence), key=lambda value: value.int))
    committed = tuple(
        sorted(
            (item.effect.id for item in evidence if item.effect.disposition == ProviderEffectDisposition.COMMITTED),
            key=lambda value: value.int,
        )
    )
    cleaned = tuple(
        sorted(
            (item.effect.id for item in evidence if item.effect.disposition == ProviderEffectDisposition.CLEANED),
            key=lambda value: value.int,
        )
    )
    return ProviderEffectRecoveryResult(
        source_job_id=context.target.source_job_id,
        effect_type=context.target.effect_type,
        schema_version=context.target.schema_version,
        effect_ids=effect_ids,
        committed_effect_ids=committed,
        cleaned_effect_ids=cleaned,
    )


async def _report_progress(
    *,
    context: JobExecutionContext[ProviderEffectRecoveryTarget, ProviderEffectRecoveryInput],
    phase: str,
    completed: int,
) -> None:
    await context.report_progress(
        JobProgressUpdate(
            phase=phase,
            progress_completed=completed,
            progress_total=3,
        )
    )


def _invalid_outcome(message: str) -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
        safe_message=message,
    )
