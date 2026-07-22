from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from orjson import dumps
from pydantic import ConfigDict, Field, ValidationError

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.assets.jobs.thumbnail_provider_effects import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailProviderEffectCleanedReferenceV1,
    AssetThumbnailProviderEffectCommittedReferenceV1,
    AssetThumbnailProviderEffectManifestV1,
    build_asset_thumbnail_output_identity,
)
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.execution_schema import JobExecutionControlSnapshot, JobExecutionLease
from src.modules.jobs.provider_effect_schema import (
    ProviderEffectRecoverySnapshot,
    ProviderEffectRegistration,
    ProviderEffectSettlement,
    ProviderEffectSnapshot,
)
from src.platform.storage.profile_routes import StorageProfileRouteBinding


class AssetThumbnailProviderEffectOperations(Protocol):
    async def register_effect(
        self,
        *,
        lease: JobExecutionLease,
        registration: ProviderEffectRegistration,
    ) -> tuple[ProviderEffectSnapshot, JobExecutionControlSnapshot]: ...

    async def list_effects(
        self,
        *,
        lease: JobExecutionLease,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]: ...

    async def settle_effects(
        self,
        *,
        lease: JobExecutionLease,
        settlement: ProviderEffectSettlement,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]: ...


class AssetThumbnailProviderEffectRecoveryOperations(Protocol):
    async def list_effects_for_recovery(
        self,
        *,
        lease: JobExecutionLease,
        source_job_id: UUID,
        effect_type: str,
        schema_version: int,
    ) -> tuple[ProviderEffectRecoverySnapshot, JobExecutionControlSnapshot]: ...

    async def settle_effects_for_recovery(
        self,
        *,
        lease: JobExecutionLease,
        source_job_id: UUID,
        effect_type: str,
        schema_version: int,
        settlement: ProviderEffectSettlement,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]: ...


class AssetThumbnailProviderEffectEvidence(BaseSchema):
    """Validated view joining one persisted Effect row to its v1 domain contract."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    effect: ProviderEffectSnapshot
    manifest: AssetThumbnailProviderEffectManifestV1
    output_identity: str = Field(..., pattern=r"^[0-9a-f]{64}$")


class AssetThumbnailProviderEffectRecoveryBatch(BaseSchema):
    """Project-routed recovery evidence validated against the source Job row."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    source_job_id: UUID
    workspace_id: UUID
    project_id: UUID
    effects: tuple[AssetThumbnailProviderEffectEvidence, ...]


class AssetThumbnailProviderEffectCoordinator:
    """Thumbnail-owned adapter over the generic normalized ProviderEffect service."""

    __slots__ = ("_operations",)

    def __init__(self, *, operations: AssetThumbnailProviderEffectOperations) -> None:
        self._operations = operations

    async def register_outputs(
        self,
        *,
        lease: JobExecutionLease,
        route: StorageProfileRouteBinding,
        manifest: AssetThumbnailProviderEffectManifestV1,
    ) -> AssetThumbnailProviderEffectEvidence:
        if manifest.job_id != lease.job_id:
            raise JobExecutionStateInvariantError("Thumbnail Provider effect manifest belongs to another Job lease")
        manifest_json = cast(JsonObject, manifest.model_dump(mode="json", by_alias=False))
        effect, _ = await self._operations.register_effect(
            lease=lease,
            registration=ProviderEffectRegistration(
                route=route,
                effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
                effect_key=ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
                schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
                manifest=manifest_json,
            ),
        )
        if effect.disposition != ProviderEffectDisposition.ACTIVE:
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect {effect.id} registration must return ACTIVE evidence"
            )
        if effect.owner_attempt_id != lease.attempt_id:
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect {effect.id} belongs to another owner Attempt"
            )
        if effect.profile_id != route.profile_id or effect.profile_revision_id != route.profile_revision_id:
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect {effect.id} differs from its registered storage route"
            )
        return _validate_effect_evidence(effect)

    async def list_effects(
        self,
        *,
        lease: JobExecutionLease,
    ) -> tuple[AssetThumbnailProviderEffectEvidence, ...]:
        effects, _ = await self._operations.list_effects(lease=lease)
        if any(effect.job_id != lease.job_id for effect in effects):
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect listing returned evidence outside Job {lease.job_id}"
            )
        return tuple(_validate_effect_evidence(effect) for effect in effects)

    async def settle_committed(
        self,
        *,
        lease: JobExecutionLease,
        evidence: AssetThumbnailProviderEffectEvidence,
    ) -> AssetThumbnailProviderEffectEvidence:
        reference = AssetThumbnailProviderEffectCommittedReferenceV1(
            effect_id=evidence.effect.id,
            manifest_hash=evidence.effect.manifest_hash,
            output_identity=evidence.output_identity,
        )
        return await self._settle(
            lease=lease,
            evidence=evidence,
            disposition=ProviderEffectDisposition.COMMITTED,
            reference=cast(JsonObject, reference.model_dump(mode="json", by_alias=False)),
        )

    async def settle_cleaned(
        self,
        *,
        lease: JobExecutionLease,
        evidence: AssetThumbnailProviderEffectEvidence,
    ) -> AssetThumbnailProviderEffectEvidence:
        reference = AssetThumbnailProviderEffectCleanedReferenceV1(
            effect_id=evidence.effect.id,
            manifest_hash=evidence.effect.manifest_hash,
            output_identity=evidence.output_identity,
        )
        return await self._settle(
            lease=lease,
            evidence=evidence,
            disposition=ProviderEffectDisposition.CLEANED,
            reference=cast(JsonObject, reference.model_dump(mode="json", by_alias=False)),
        )

    async def _settle(
        self,
        *,
        lease: JobExecutionLease,
        evidence: AssetThumbnailProviderEffectEvidence,
        disposition: ProviderEffectDisposition,
        reference: JsonObject,
    ) -> AssetThumbnailProviderEffectEvidence:
        if evidence.effect.job_id != lease.job_id:
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect {evidence.effect.id} cannot settle under another Job lease"
            )
        effects, _ = await self._operations.settle_effects(
            lease=lease,
            settlement=ProviderEffectSettlement(
                effect_ids=(evidence.effect.id,),
                disposition=disposition,
                settlement_reference=reference,
            ),
        )
        if len(effects) != 1 or effects[0].id != evidence.effect.id:
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect {evidence.effect.id} settlement returned another Effect"
            )
        settled = _validate_effect_evidence(effects[0])
        if settled.effect.disposition != disposition or settled.effect.settlement_reference != reference:
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect {evidence.effect.id} settlement evidence is not exact"
            )
        return settled


class AssetThumbnailProviderEffectRecoveryCoordinator:
    """Thumbnail contract adapter authorized by a separate maintenance Job lease."""

    __slots__ = ("_operations",)

    def __init__(self, *, operations: AssetThumbnailProviderEffectRecoveryOperations) -> None:
        self._operations = operations

    async def list_effects(
        self,
        *,
        lease: JobExecutionLease,
        source_job_id: UUID,
    ) -> AssetThumbnailProviderEffectRecoveryBatch:
        snapshot, _ = await self._operations.list_effects_for_recovery(
            lease=lease,
            source_job_id=source_job_id,
            effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
            schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
        )
        effects = snapshot.effects
        if snapshot.source_job_id != source_job_id:
            raise JobExecutionStateInvariantError(
                f"Thumbnail recovery returned scope outside source Job {source_job_id}"
            )
        if snapshot.workspace_id is None or snapshot.project_id is None or snapshot.site_id is not None:
            raise JobExecutionStateInvariantError(
                f"Thumbnail recovery source Job {source_job_id} is not project scoped"
            )
        if any(effect.job_id != source_job_id for effect in effects):
            raise JobExecutionStateInvariantError(
                f"Thumbnail recovery returned evidence outside source Job {source_job_id}"
            )
        evidence = tuple(_validate_effect_evidence(effect) for effect in effects)
        if any(item.manifest.project_id != snapshot.project_id for item in evidence):
            raise JobExecutionStateInvariantError(
                f"Thumbnail recovery evidence differs from source Job {source_job_id} project scope"
            )
        return AssetThumbnailProviderEffectRecoveryBatch(
            source_job_id=source_job_id,
            workspace_id=snapshot.workspace_id,
            project_id=snapshot.project_id,
            effects=evidence,
        )

    async def settle_committed(
        self,
        *,
        lease: JobExecutionLease,
        source_job_id: UUID,
        evidence: AssetThumbnailProviderEffectEvidence,
    ) -> AssetThumbnailProviderEffectEvidence:
        reference = AssetThumbnailProviderEffectCommittedReferenceV1(
            effect_id=evidence.effect.id,
            manifest_hash=evidence.effect.manifest_hash,
            output_identity=evidence.output_identity,
        )
        return await self._settle(
            lease=lease,
            source_job_id=source_job_id,
            evidence=evidence,
            disposition=ProviderEffectDisposition.COMMITTED,
            reference=cast(JsonObject, reference.model_dump(mode="json", by_alias=False)),
        )

    async def settle_cleaned(
        self,
        *,
        lease: JobExecutionLease,
        source_job_id: UUID,
        evidence: AssetThumbnailProviderEffectEvidence,
    ) -> AssetThumbnailProviderEffectEvidence:
        reference = AssetThumbnailProviderEffectCleanedReferenceV1(
            effect_id=evidence.effect.id,
            manifest_hash=evidence.effect.manifest_hash,
            output_identity=evidence.output_identity,
        )
        return await self._settle(
            lease=lease,
            source_job_id=source_job_id,
            evidence=evidence,
            disposition=ProviderEffectDisposition.CLEANED,
            reference=cast(JsonObject, reference.model_dump(mode="json", by_alias=False)),
        )

    async def _settle(
        self,
        *,
        lease: JobExecutionLease,
        source_job_id: UUID,
        evidence: AssetThumbnailProviderEffectEvidence,
        disposition: ProviderEffectDisposition,
        reference: JsonObject,
    ) -> AssetThumbnailProviderEffectEvidence:
        if evidence.effect.job_id != source_job_id:
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect {evidence.effect.id} belongs to another recovery source Job"
            )
        effects, _ = await self._operations.settle_effects_for_recovery(
            lease=lease,
            source_job_id=source_job_id,
            effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
            schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
            settlement=ProviderEffectSettlement(
                effect_ids=(evidence.effect.id,),
                disposition=disposition,
                settlement_reference=reference,
            ),
        )
        if len(effects) != 1 or effects[0].id != evidence.effect.id:
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect {evidence.effect.id} recovery settled another Effect"
            )
        settled = _validate_effect_evidence(effects[0])
        if settled.effect.disposition != disposition or settled.effect.settlement_reference != reference:
            raise JobExecutionStateInvariantError(
                f"Thumbnail Provider effect {evidence.effect.id} recovery settlement is not exact"
            )
        return settled


def _validate_effect_evidence(effect: ProviderEffectSnapshot) -> AssetThumbnailProviderEffectEvidence:
    try:
        manifest = AssetThumbnailProviderEffectManifestV1.model_validate_json(
            dumps(effect.manifest),
            strict=True,
        )
    except (ValidationError, TypeError, ValueError) as exc:
        raise JobExecutionStateInvariantError(
            f"Thumbnail Provider effect {effect.id} has an invalid v1 manifest"
        ) from exc
    output_identity = build_asset_thumbnail_output_identity(effect=effect, manifest=manifest)
    _validate_terminal_reference(
        effect=effect,
        output_identity=output_identity,
    )
    return AssetThumbnailProviderEffectEvidence(
        effect=effect,
        manifest=manifest,
        output_identity=output_identity,
    )


def _validate_terminal_reference(
    *,
    effect: ProviderEffectSnapshot,
    output_identity: str,
) -> None:
    disposition = ProviderEffectDisposition(effect.disposition)
    if disposition == ProviderEffectDisposition.ACTIVE:
        if effect.settlement_reference is not None:
            raise JobExecutionStateInvariantError(
                f"Active Thumbnail Provider effect {effect.id} cannot carry terminal evidence"
            )
        return
    if effect.settlement_reference is None:
        raise JobExecutionStateInvariantError(
            f"Terminal Thumbnail Provider effect {effect.id} is missing settlement evidence"
        )
    reference_model = (
        AssetThumbnailProviderEffectCommittedReferenceV1
        if disposition == ProviderEffectDisposition.COMMITTED
        else AssetThumbnailProviderEffectCleanedReferenceV1
    )
    try:
        reference = reference_model.model_validate_json(
            dumps(effect.settlement_reference),
            strict=True,
        )
    except (ValidationError, TypeError, ValueError) as exc:
        raise JobExecutionStateInvariantError(
            f"Terminal Thumbnail Provider effect {effect.id} has invalid settlement evidence"
        ) from exc
    if (
        reference.effect_id != effect.id
        or reference.manifest_hash != effect.manifest_hash
        or reference.output_identity != output_identity
    ):
        raise JobExecutionStateInvariantError(
            f"Terminal Thumbnail Provider effect {effect.id} settlement evidence is not exact"
        )
