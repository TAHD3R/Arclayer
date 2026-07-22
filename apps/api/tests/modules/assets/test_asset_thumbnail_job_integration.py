from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast
from uuid import UUID, uuid4

import pytest
from orjson import dumps
from PIL import Image

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import Settings, get_settings
from src.models.assets.asset import AssetPurpose, AssetRecord
from src.models.jobs.background_job import JobWorkloadClass
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.models.workspaces.workspace import Workspace
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobTarget,
)
from src.modules.assets.jobs.thumbnail_handler import AssetThumbnailJobHandler
from src.modules.assets.jobs.thumbnail_pipeline import StorageAssetThumbnailPipeline
from src.modules.assets.jobs.thumbnail_provider_effect_coordinator import (
    AssetThumbnailProviderEffectCoordinator,
)
from src.modules.assets.jobs.thumbnail_provider_effects import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailProviderEffectCleanedReferenceV1,
    AssetThumbnailProviderEffectCommittedReferenceV1,
    AssetThumbnailProviderEffectManifestV1,
    AssetThumbnailProviderOutputV1,
    build_asset_thumbnail_provider_effect_contract,
)
from src.modules.assets.jobs.thumbnail_provider_storage import (
    ExactAssetThumbnailProviderStorageResolver,
)
from src.modules.assets.jobs.thumbnail_repository import TenantAssetThumbnailRepository
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.execution_schema import (
    JobExecutionControlSnapshot,
    JobExecutionLease,
    JobProgressUpdate,
)
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_contracts import ProviderEffectContractRegistry
from src.modules.jobs.provider_effect_schema import (
    ProviderEffectRegistration,
    ProviderEffectSettlement,
    ProviderEffectSnapshot,
)
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.local import LocalStorageProvider, safe_object_key_to_path
from src.platform.storage.profile_route_service import ResolvedStorageProfileRoute
from src.platform.storage.profile_routes import (
    StorageProfileRouteBinding,
    build_storage_profile_route_from_config,
    storage_profile_route_hash,
)
from src.platform.storage.profile_schema import StorageProfileConfig
from tests.modules.workspaces.content.test_content_items_integration import _tenant_conn, _workspace_client

pytestmark = pytest.mark.integration

_NOW = datetime(2026, 7, 18, 8, tzinfo=UTC)
_PROFILE_KEY = "thumbnail-vertical-local"


class _CountingLocalStorageProvider(LocalStorageProvider):
    def __init__(self, config: StorageProfileConfig, *, events: list[tuple[str, object]]) -> None:
        super().__init__(config)
        self.events = events
        self.put_calls: list[str] = []
        self.delete_calls: list[str] = []

    async def put_object_bytes(
        self,
        *,
        object_key: str,
        data: bytes,
        content_type: str | None,
        cache_control: str | None = None,
    ) -> None:
        self.put_calls.append(object_key)
        self.events.append(("put", object_key))
        await super().put_object_bytes(
            object_key=object_key,
            data=data,
            content_type=content_type,
            cache_control=cache_control,
        )

    async def delete_object(self, *, object_key: str) -> None:
        self.delete_calls.append(object_key)
        self.events.append(("delete", object_key))
        await super().delete_object(object_key=object_key)


class _NormalizedProviderEffectHarness:
    """Faithful in-memory persistence for the Effect protocol used by this vertical test."""

    def __init__(
        self,
        *,
        binding: StorageProfileRouteBinding,
        config: StorageProfileConfig,
        events: list[tuple[str, object]],
    ) -> None:
        self.binding = binding
        self.config = config
        self.events = events
        self.effects: dict[UUID, ProviderEffectSnapshot] = {}
        self.registrations: list[ProviderEffectRegistration] = []
        self.settlements: list[ProviderEffectSettlement] = []
        self.transitions: list[tuple[UUID, ProviderEffectDisposition, ProviderEffectDisposition]] = []
        self.contracts = ProviderEffectContractRegistry((build_asset_thumbnail_provider_effect_contract(),))

    async def materialize_storage_profile_route(
        self,
        *,
        profile_key: str,
    ) -> StorageProfileRouteBinding:
        assert profile_key == _PROFILE_KEY
        self.events.append(("materialize-route", profile_key))
        return self.binding

    async def resolve_storage_profile_binding(
        self,
        *,
        binding: StorageProfileRouteBinding,
    ) -> ResolvedStorageProfileRoute:
        assert binding == self.binding
        self.events.append(("resolve-binding", binding.profile_revision_id))
        return self._resolved_route()

    async def resolve_effect_route(self, *, effect_id: UUID) -> ResolvedStorageProfileRoute:
        assert effect_id in self.effects
        self.events.append(("resolve-effect-route", effect_id))
        return self._resolved_route()

    async def register_effect(
        self,
        *,
        lease: JobExecutionLease,
        registration: ProviderEffectRegistration,
    ) -> tuple[ProviderEffectSnapshot, JobExecutionControlSnapshot]:
        assert registration.route == self.binding
        canonical_manifest = self.contracts.validate_manifest(
            effect_type=registration.effect_type,
            schema_version=registration.schema_version,
            value=registration.manifest,
        )
        existing = next(
            (
                effect
                for effect in self.effects.values()
                if effect.owner_attempt_id == lease.attempt_id
                and effect.effect_type == registration.effect_type
                and effect.effect_key == registration.effect_key
            ),
            None,
        )
        if existing is not None:
            if (
                existing.job_id != lease.job_id
                or existing.profile_id != registration.route.profile_id
                or existing.profile_revision_id != registration.route.profile_revision_id
                or existing.schema_version != registration.schema_version
                or existing.manifest != canonical_manifest
            ):
                raise JobExecutionStateInvariantError(
                    "Provider Effect registration replay differs from persisted evidence"
                )
            return existing, _control(lease)

        effect = ProviderEffectSnapshot(
            id=uuid4(),
            job_id=lease.job_id,
            owner_attempt_id=lease.attempt_id,
            profile_id=registration.route.profile_id,
            profile_revision_id=registration.route.profile_revision_id,
            effect_type=registration.effect_type,
            effect_key=registration.effect_key,
            schema_version=registration.schema_version,
            manifest=canonical_manifest,
            manifest_hash=hash_json(canonical_manifest),
            disposition=ProviderEffectDisposition.ACTIVE,
            registered_at=_NOW,
        )
        self.effects[effect.id] = effect
        self.registrations.append(registration)
        self.events.append(("register", effect.id))
        return effect, _control(lease)

    async def list_effects(
        self,
        *,
        lease: JobExecutionLease,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]:
        effects = tuple(
            sorted(
                (effect for effect in self.effects.values() if effect.job_id == lease.job_id),
                key=lambda effect: (effect.registered_at, effect.id.int),
            )
        )
        return effects, _control(lease)

    async def settle_effects(
        self,
        *,
        lease: JobExecutionLease,
        settlement: ProviderEffectSettlement,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]:
        disposition = ProviderEffectDisposition(settlement.disposition)
        settled: list[ProviderEffectSnapshot] = []
        for effect_id in settlement.effect_ids:
            effect = self.effects.get(effect_id)
            if effect is None or effect.job_id != lease.job_id:
                raise JobExecutionStateInvariantError(
                    "Provider Effect settlement did not identify exact Job-owned evidence"
                )
            reference = self.contracts.validate_settlement_reference(
                effect_type=effect.effect_type,
                schema_version=effect.schema_version,
                disposition=disposition,
                value=settlement.settlement_reference,
            )
            if effect.disposition != ProviderEffectDisposition.ACTIVE:
                if effect.disposition != disposition or effect.settlement_reference != reference:
                    raise JobExecutionStateInvariantError(
                        "Provider Effect terminal replay differs from persisted evidence"
                    )
                settled.append(effect)
                continue
            replacement = effect.model_copy(
                update={
                    "disposition": disposition,
                    "settled_at": _NOW + timedelta(seconds=1),
                    "settled_by_attempt_id": lease.attempt_id,
                    "settlement_reference": reference,
                }
            )
            self.effects[effect.id] = replacement
            self.transitions.append((effect.id, ProviderEffectDisposition.ACTIVE, disposition))
            self.events.append((f"settle-{disposition.value}", effect.id))
            settled.append(replacement)
        self.settlements.append(settlement)
        return tuple(settled), _control(lease)

    def _resolved_route(self) -> ResolvedStorageProfileRoute:
        return ResolvedStorageProfileRoute(
            binding=self.binding,
            profile_key=_PROFILE_KEY,
            config=self.config,
            is_tombstoned=False,
        )


class _HandlerContext:
    def __init__(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        asset_id: UUID,
        job_id: UUID,
        source_revision: str,
    ) -> None:
        self.lease = JobExecutionLease(
            job_id=job_id,
            attempt_id=uuid4(),
            dispatch_sequence=1,
            attempt_number=1,
            worker_id="thumbnail-vertical-worker",
            fencing_token=uuid4(),
            job_type="asset.thumbnail.generate",
            job_type_version=1,
            workload_class=JobWorkloadClass.ASSET_CPU,
            claimed_at=_NOW,
            lease_until=_NOW + timedelta(minutes=5),
        )
        self.target = AssetThumbnailJobTarget(
            workspace_id=workspace_id,
            project_id=project_id,
            entity_id=asset_id,
        )
        self.input_reference = AssetThumbnailJobInput(
            asset_id=asset_id,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        )
        self.source_revision = source_revision
        self.request_fingerprint = "f" * 64
        self.progress: list[JobProgressUpdate] = []
        self.fenced_commits = 0

    def idempotency_key(self, *, step: str) -> str:
        assert step == "thumbnail-pipeline"
        return "d" * 64

    async def checkpoint(self) -> JobExecutionControlSnapshot:
        return _control(self.lease)

    async def report_progress(
        self,
        update: JobProgressUpdate,
    ) -> JobExecutionControlSnapshot:
        self.progress.append(update)
        return _control(self.lease)

    async def run_fenced_domain_commit(self, operation):  # type: ignore[no-untyped-def]
        self.fenced_commits += 1
        return await operation()


@pytest.mark.asyncio
async def test_real_local_pipeline_registers_marker_identity_commits_effect_and_retries_marker_first(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    events: list[tuple[str, object]] = []
    config = _local_config(root=root, scratch=scratch)
    provider = _CountingLocalStorageProvider(config, events=events)
    effects = _effect_harness(config=config, events=events)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        workspace_id = decode_public_id(workspace_public_id)
        project_id = decode_public_id(project_public_id)
        tenant_context = await _tenant_context(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        asset_id = uuid4()
        checksum = "a" * 64
        object_key = f"projects/{project_id}/assets/{asset_id}/source.png"
        source_path = safe_object_key_to_path(root, object_key)
        source_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (600, 400), color="navy").save(source_path)
        await _create_asset(
            workspace_public_id=workspace_public_id,
            asset_id=asset_id,
            project_id=project_id,
            object_key=object_key,
            checksum=checksum,
        )

        handler = _handler(
            config=config,
            provider=provider,
            effects=effects,
            scratch=scratch,
            tenant_context=tenant_context,
        )
        context = _HandlerContext(
            workspace_id=workspace_id,
            project_id=project_id,
            asset_id=asset_id,
            job_id=uuid4(),
            source_revision=checksum,
        )

        result = await handler.execute(context=_as_handler_context(context))

        assert len(effects.effects) == 1
        assert len(effects.registrations) == 1
        registration = effects.registrations[0]
        assert registration.effect_type == ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE
        assert registration.effect_key == ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY
        assert registration.schema_version == ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION
        effect = next(iter(effects.effects.values()))
        assert effect.disposition == ProviderEffectDisposition.COMMITTED
        committed_reference = AssetThumbnailProviderEffectCommittedReferenceV1.model_validate_json(
            dumps(effect.settlement_reference),
            strict=True,
        )
        async with _tenant_conn(workspace_public_id) as conn:
            persisted = await AssetRecord.get(id=asset_id, using_db=conn)
        marker = cast(dict[str, object], persisted.meta["thumbnail_generation"])
        marker_identity = marker["outputIdentity"]

        assert result.produced_widths == (400, 600)
        assert marker["jobId"] == encode_uuid(context.lease.job_id)
        assert marker_identity == committed_reference.output_identity
        assert committed_reference.effect_id == effect.id
        assert committed_reference.manifest_hash == effect.manifest_hash
        assert effects.transitions == [
            (
                effect.id,
                ProviderEffectDisposition.ACTIVE,
                ProviderEffectDisposition.COMMITTED,
            )
        ]
        assert context.fenced_commits == 1
        assert [update.phase for update in context.progress] == [
            "resolving",
            "rendering_preview",
            "generating",
            "uploading",
            "persisting",
        ]
        assert [item["width"] for item in persisted.variants["thumbnails"]] == [400, 600]
        register_index = events.index(("register", effect.id))
        put_indexes = [index for index, event in enumerate(events) if event[0] == "put"]
        settle_index = events.index(("settle-committed", effect.id))
        assert put_indexes
        assert register_index < min(put_indexes) < max(put_indexes) < settle_index

        put_calls_before_retry = tuple(provider.put_calls)
        registrations_before_retry = tuple(effects.registrations)
        settlements_before_retry = tuple(effects.settlements)

        reconciled = await handler.reconcile(context=_as_handler_context(context))

        assert reconciled == result
        assert tuple(provider.put_calls) == put_calls_before_retry
        assert tuple(effects.registrations) == registrations_before_retry
        assert tuple(effects.settlements) == settlements_before_retry
        assert effects.effects[effect.id].disposition == ProviderEffectDisposition.COMMITTED


@pytest.mark.asyncio
async def test_marker_absent_active_effect_deletes_exact_outputs_and_settles_cleaned(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    events: list[tuple[str, object]] = []
    config = _local_config(root=root, scratch=scratch)
    provider = _CountingLocalStorageProvider(config, events=events)
    effects = _effect_harness(config=config, events=events)
    coordinator = AssetThumbnailProviderEffectCoordinator(operations=effects)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        workspace_id = decode_public_id(workspace_public_id)
        project_id = decode_public_id(project_public_id)
        tenant_context = await _tenant_context(
            workspace_id=workspace_id,
            project_id=project_id,
        )
        asset_id = uuid4()
        checksum = "b" * 64
        source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
        await _create_asset(
            workspace_public_id=workspace_public_id,
            asset_id=asset_id,
            project_id=project_id,
            object_key=source_key,
            checksum=checksum,
        )
        context = _HandlerContext(
            workspace_id=workspace_id,
            project_id=project_id,
            asset_id=asset_id,
            job_id=uuid4(),
            source_revision=checksum,
        )
        outputs = _outputs(
            job_id=context.lease.job_id,
            project_id=project_id,
            asset_id=asset_id,
        )
        manifest = AssetThumbnailProviderEffectManifestV1(
            job_id=context.lease.job_id,
            project_id=project_id,
            asset_id=asset_id,
            request_fingerprint=context.request_fingerprint,
            source_revision=checksum,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
            target_bucket=None,
            outputs=outputs,
        )

        active = await coordinator.register_outputs(
            lease=context.lease,
            route=effects.binding,
            manifest=manifest,
        )
        assert active.effect.disposition == ProviderEffectDisposition.ACTIVE
        for output in outputs:
            await provider.put_object_bytes(
                object_key=output.object_key,
                data=b"owned-thumbnail",
                content_type="image/jpeg",
            )
            assert safe_object_key_to_path(root, output.object_key).is_file()
        scratch_job_root = scratch / "thumbnail-jobs" / str(context.lease.job_id)
        scratch_job_root.mkdir(parents=True)
        (scratch_job_root / "orphan.tmp").write_bytes(b"scratch")
        handler = _handler(
            config=config,
            provider=provider,
            effects=effects,
            scratch=scratch,
            tenant_context=tenant_context,
        )

        reconciled = await handler.reconcile(context=_as_handler_context(context))

        assert reconciled is None
        cleaned = effects.effects[active.effect.id]
        cleaned_reference = AssetThumbnailProviderEffectCleanedReferenceV1.model_validate_json(
            dumps(cleaned.settlement_reference),
            strict=True,
        )
        assert cleaned.disposition == ProviderEffectDisposition.CLEANED
        assert cleaned_reference.effect_id == active.effect.id
        assert cleaned_reference.manifest_hash == active.effect.manifest_hash
        assert cleaned_reference.output_identity == active.output_identity
        assert effects.transitions == [
            (
                active.effect.id,
                ProviderEffectDisposition.ACTIVE,
                ProviderEffectDisposition.CLEANED,
            )
        ]
        assert tuple(provider.delete_calls) == tuple(output.object_key for output in outputs)
        assert all(not safe_object_key_to_path(root, output.object_key).exists() for output in outputs)
        assert not scratch_job_root.exists()
        resolve_index = events.index(("resolve-effect-route", active.effect.id))
        first_delete_index = next(index for index, event in enumerate(events) if event[0] == "delete")
        cleaned_index = events.index(("settle-cleaned", active.effect.id))
        assert resolve_index < first_delete_index < cleaned_index


def _local_config(*, root: Path, scratch: Path) -> StorageProfileConfig:
    return StorageProfileConfig(
        provider=ObjectStorageProviderKind.LOCAL,
        local_root_dir=root,
        local_tmp_dir=scratch,
    )


def _effect_harness(
    *,
    config: StorageProfileConfig,
    events: list[tuple[str, object]],
) -> _NormalizedProviderEffectHarness:
    route = build_storage_profile_route_from_config(config)
    return _NormalizedProviderEffectHarness(
        binding=StorageProfileRouteBinding(
            profile_id=uuid4(),
            profile_revision_id=uuid4(),
            route_hash=storage_profile_route_hash(route),
            route=route,
        ),
        config=config,
        events=events,
    )


def _handler(
    *,
    config: StorageProfileConfig,
    provider: _CountingLocalStorageProvider,
    effects: _NormalizedProviderEffectHarness,
    scratch: Path,
    tenant_context: TenantContext,
) -> AssetThumbnailJobHandler:
    async def load_profile(
        *,
        settings: Settings,
        profile_key: str,
    ) -> StorageProfileConfig:
        _ = settings
        assert profile_key == _PROFILE_KEY
        return config

    storage = ExactAssetThumbnailProviderStorageResolver(
        get_settings(),
        route_operations=effects,
        source_profile_loader=load_profile,
        provider_builder=lambda _config: provider,
    )
    repository = TenantAssetThumbnailRepository(
        tenant_context_provider=lambda: tenant_context,
    )
    return AssetThumbnailJobHandler(
        repository=repository,
        pipeline=StorageAssetThumbnailPipeline(
            scratch_root=scratch,
            storage_resolver=storage,
        ),
        effects=AssetThumbnailProviderEffectCoordinator(operations=effects),
        storage=storage,
    )


async def _tenant_context(*, workspace_id: UUID, project_id: UUID) -> TenantContext:
    workspace = await Workspace.get(id=workspace_id)
    tenant = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_id)
    assert tenant is not None
    return TenantContext(
        identity=TenantIdentity(
            organization_id=workspace.organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            schema_name=tenant.schema_name,
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.JOB,
    )


async def _create_asset(
    *,
    workspace_public_id: str,
    asset_id: UUID,
    project_id: UUID,
    object_key: str,
    checksum: str,
) -> None:
    async with _tenant_conn(workspace_public_id) as conn:
        await AssetRecord.create(
            id=asset_id,
            project_id=project_id,
            purpose=AssetPurpose.LIBRARY,
            object_key=object_key,
            mime="image/png",
            ext="png",
            checksum_sha256=checksum,
            storage_provider=ObjectStorageProviderKind.LOCAL,
            storage_profile_key=_PROFILE_KEY,
            using_db=conn,
        )


def _outputs(
    *,
    job_id: UUID,
    project_id: UUID,
    asset_id: UUID,
) -> tuple[AssetThumbnailProviderOutputV1, ...]:
    return tuple(
        AssetThumbnailProviderOutputV1(
            width=width,
            object_key=(f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}/thumb-{width}.jpg"),
        )
        for width in (400, 600)
    )


def _control(lease: JobExecutionLease) -> JobExecutionControlSnapshot:
    return JobExecutionControlSnapshot(
        job_id=lease.job_id,
        attempt_id=lease.attempt_id,
        fencing_token=lease.fencing_token,
        observed_at=_NOW,
        lease_until=lease.lease_until,
    )


def _as_handler_context(
    context: _HandlerContext,
) -> JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput]:
    return cast(JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput], context)
