from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from PIL import Image
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.utils.public_ids import decode_public_id
from src.config import Settings, get_settings
from src.models.assets.asset import AssetPurpose, AssetRecord
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
)
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.models.storage.storage_profile import StorageProfile, StorageProfileConfigSource
from src.models.workspaces.workspace import Workspace
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
)
from src.modules.assets.jobs.thumbnail_handler import AssetThumbnailJobHandler
from src.modules.assets.jobs.thumbnail_pipeline import (
    AssetThumbnailPipelineControl,
    AssetThumbnailPipelineOperation,
    AssetThumbnailPipelineResult,
    AssetThumbnailSource,
    StorageAssetThumbnailPipeline,
)
from src.modules.assets.jobs.thumbnail_provider_effect_coordinator import (
    AssetThumbnailProviderEffectCoordinator,
    AssetThumbnailProviderEffectEvidence,
)
from src.modules.assets.jobs.thumbnail_provider_effects import (
    AssetThumbnailProviderEffectManifestV1,
    AssetThumbnailProviderOutputV1,
    build_asset_thumbnail_provider_effect_contract,
)
from src.modules.assets.jobs.thumbnail_provider_storage import (
    ExactAssetThumbnailProviderStorageResolver,
)
from src.modules.assets.jobs.thumbnail_repository import (
    AssetThumbnailOutcomeWrite,
    TenantAssetThumbnailRepository,
)
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_errors import JobExecutionLeaseLostError
from src.modules.jobs.execution_registry import (
    JobExecutionContext,
    JobExecutionRegistry,
    JobTypeRegistration,
)
from src.modules.jobs.execution_schema import (
    JobDeliveryCommand,
    JobDeliveryDisposition,
    JobExecutionLease,
)
from src.modules.jobs.execution_service import BackgroundJobExecutionService
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_contracts import ProviderEffectContractRegistry
from src.modules.jobs.provider_effect_repository import ProviderEffectRepository
from src.modules.jobs.provider_effect_service import ProviderEffectService
from src.modules.jobs.registry import JobTypeDefinition
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.schema import JobDispatchEnvelope
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from src.platform.jobs.execution_context import FencedJobExecutionContext
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.errors import StorageObjectNotFoundError
from src.platform.storage.profile_route_repository import StorageProfileRouteRepository
from src.platform.storage.profile_route_service import StorageProfileRouteService
from src.platform.storage.profile_routes import StorageProfileRouteBinding
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.providers.base import ObjectHead, ObjectStorageProvider
from tests.modules.workspaces.content.test_content_items_integration import _tenant_conn, _workspace_client

pytestmark = pytest.mark.integration

_LOCK_PROBE_ATTEMPTS = 500
_LOCK_PROBE_INTERVAL_SECONDS = 0.01
_SYNC_TIMEOUT_SECONDS = 5.0
_TRANSPORT_MESSAGE_ID = "thumbnail-provider-effect-race"
_THUMBNAIL_WIDTH = 320


class _NoopThumbnailHandler:
    async def reconcile(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult | None:
        _ = context
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> AssetThumbnailJobResult:
        _ = context
        raise AssertionError("delivery acceptance must not execute the domain handler")

    async def cancel(
        self,
        *,
        context: JobExecutionContext[AssetThumbnailJobTarget, AssetThumbnailJobInput],
    ) -> None:
        _ = context


@dataclass(slots=True)
class _ObjectStoreState:
    objects: dict[tuple[str, str], bytes] = field(default_factory=dict)
    put_calls: list[tuple[str, str]] = field(default_factory=list)
    delete_calls: list[tuple[str, str]] = field(default_factory=list)
    not_found_delete_calls: list[tuple[str, str]] = field(default_factory=list)
    delete_credentials: list[tuple[str | None, str | None]] = field(default_factory=list)

    def seed(self, *, bucket: str, object_key: str, data: bytes = b"owned") -> None:
        self.objects[(bucket, object_key)] = data

    def contains(self, *, bucket: str, object_key: str) -> bool:
        return (bucket, object_key) in self.objects

    def build_provider(self, config: StorageProfileConfig) -> _RecordingObjectStorageProvider:
        return _RecordingObjectStorageProvider(config, state=self)


class _RecordingObjectStorageProvider(ObjectStorageProvider):
    def __init__(self, config: StorageProfileConfig, *, state: _ObjectStoreState) -> None:
        super().__init__(config)
        self._state = state

    def with_bucket(self, bucket: str) -> _RecordingObjectStorageProvider:
        return _RecordingObjectStorageProvider(
            self.config.model_copy(update={"bucket": bucket}),
            state=self._state,
        )

    async def download_object_to_path(self, *, object_key: str, out_path: Path) -> ObjectHead:
        bucket = self.require_bucket()
        try:
            payload = self._state.objects[(bucket, object_key)]
        except KeyError as exc:
            raise StorageObjectNotFoundError(provider=self.provider, object_key=object_key) from exc
        await asyncio.to_thread(out_path.parent.mkdir, parents=True, exist_ok=True)
        await asyncio.to_thread(out_path.write_bytes, payload)
        return ObjectHead(size_bytes=len(payload), content_type="image/png", etag=None)

    async def put_object_bytes(
        self,
        *,
        object_key: str,
        data: bytes,
        content_type: str | None,
        cache_control: str | None = None,
    ) -> None:
        _ = content_type, cache_control
        bucket = self.require_bucket()
        self._state.put_calls.append((bucket, object_key))
        self._state.objects[(bucket, object_key)] = data

    async def delete_object(self, *, object_key: str) -> None:
        bucket = self.require_bucket()
        identity = (bucket, object_key)
        self._state.delete_calls.append(identity)
        secret = self.config.secret_access_key
        self._state.delete_credentials.append((
            self.config.access_key_id,
            secret.get_secret_value() if secret is not None else None,
        ))
        if identity not in self._state.objects:
            self._state.not_found_delete_calls.append(identity)
            raise StorageObjectNotFoundError(provider=self.provider, object_key=object_key)
        del self._state.objects[identity]


class _RecordingThumbnailPipeline(StorageAssetThumbnailPipeline):
    __slots__ = ("execute_calls",)

    def __init__(
        self,
        *,
        scratch_root: Path,
        storage_resolver: ExactAssetThumbnailProviderStorageResolver,
    ) -> None:
        super().__init__(scratch_root=scratch_root, storage_resolver=storage_resolver)
        self.execute_calls = 0

    async def execute(
        self,
        *,
        source: AssetThumbnailSource,
        operation: AssetThumbnailPipelineOperation,
        control: AssetThumbnailPipelineControl,
    ) -> AssetThumbnailPipelineResult:
        self.execute_calls += 1
        return await super().execute(source=source, operation=operation, control=control)


class _FailFirstSettlementRepository(ProviderEffectRepository):
    def __init__(self, *, disposition: ProviderEffectDisposition) -> None:
        super().__init__()
        self._disposition = disposition
        self.failed = False

    async def settle_active_effect(self, **kwargs):  # type: ignore[no-untyped-def]
        if not self.failed and kwargs["disposition"] == self._disposition:
            self.failed = True
            raise RuntimeError(f"injected {self._disposition.value} settlement failure")
        return await super().settle_active_effect(**kwargs)


class _ListingEffectLockProbeRepository(ProviderEffectRepository):
    def __init__(self) -> None:
        super().__init__()
        self.requested = asyncio.Event()
        self.backend_pids: set[int] = set()

    async def list_all_effects_for_job_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> list[ProviderEffectRecord]:
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))
        self.requested.set()
        return await super().list_all_effects_for_job_for_update(job_id=job_id, conn=conn)


@dataclass(frozen=True, slots=True)
class _PublicJobSubject:
    job: BackgroundJobRecord
    target: AssetThumbnailJobTarget
    input_reference: AssetThumbnailJobInput
    first_lease: JobExecutionLease
    second_envelope: JobDispatchEnvelope


@dataclass(frozen=True, slots=True)
class _Scenario:
    settings: Settings
    profile: StorageProfile
    binding: StorageProfileRouteBinding
    state: _ObjectStoreState
    bucket: str
    source_key: str
    asset_id: UUID
    project_id: UUID
    tenant_repository: TenantAssetThumbnailRepository
    job_repository: BackgroundJobRepository
    execution: BackgroundJobExecutionService
    subject: _PublicJobSubject
    scratch_root: Path


@dataclass(frozen=True, slots=True)
class _DomainRuntime:
    service: ProviderEffectService
    effects: AssetThumbnailProviderEffectCoordinator
    storage: ExactAssetThumbnailProviderStorageResolver
    pipeline: _RecordingThumbnailPipeline
    handler: AssetThumbnailJobHandler


def _build_execution_service(
    settings: Settings,
    repository: BackgroundJobRepository,
) -> tuple[BackgroundJobExecutionService, JobTypeDefinition]:
    job_types = build_builtin_job_type_registry(settings)
    definition = job_types.require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    executions = JobExecutionRegistry(
        job_types=job_types,
        registrations=[
            JobTypeRegistration.from_definition(
                definition=definition,
                handler_factory=_NoopThumbnailHandler,
            )
        ],
    )
    return (
        BackgroundJobExecutionService(
            settings,
            repository=repository,
            job_types=job_types,
            executions=executions,
        ),
        definition,
    )


async def _create_public_job_subject(
    *,
    service: BackgroundJobExecutionService,
    definition: JobTypeDefinition,
    workspace_id: UUID,
    project_id: UUID,
    asset_id: UUID,
    source_revision: str,
) -> _PublicJobSubject:
    target = AssetThumbnailJobTarget(
        workspace_id=workspace_id,
        project_id=project_id,
        entity_id=asset_id,
    )
    input_reference = AssetThumbnailJobInput(
        asset_id=asset_id,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
    )
    token = uuid4().hex
    job = await BackgroundJobRecord.create(
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        internal_status=JobInternalStatus.PENDING_DISPATCH,
        retry_class=definition.retry_class,
        authority_mode=definition.authority_mode,
        workspace_id=workspace_id,
        project_id=project_id,
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        idempotency_scope_key=f"{workspace_id}:{project_id}:thumbnail-race",
        idempotency_key_hash=hash_json({"idempotency": token}),
        request_fingerprint=hash_json({"request": token}),
        source_revision=source_revision,
        correlation_id=f"thumbnail-provider-effect-race-{token}",
        phase=definition.initial_phase,
        status_key=definition.initial_status_key,
        retry_policy=definition.retry_policy.model_dump(mode="json", by_alias=True),
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
    )
    first_envelope = await _create_dispatch(job=job, dispatch_sequence=1)
    first_lease = await _claim_attempt(
        service=service,
        job=job,
        envelope=first_envelope,
        worker_id="thumbnail-race-worker-1",
    )
    second_envelope = await _create_dispatch(job=job, dispatch_sequence=2)
    return _PublicJobSubject(
        job=job,
        target=target,
        input_reference=input_reference,
        first_lease=first_lease,
        second_envelope=second_envelope,
    )


async def _create_dispatch(
    *,
    job: BackgroundJobRecord,
    dispatch_sequence: int,
) -> JobDispatchEnvelope:
    envelope = JobDispatchEnvelope(
        job_id=job.id,
        dispatch_sequence=dispatch_sequence,
        job_type=job.job_type,
        job_type_version=job.job_type_version,
        workload_class=job.workload_class,
        target_descriptor=job.target_descriptor,
        request_fingerprint=job.request_fingerprint,
    )
    serialized = envelope.model_dump(mode="json", by_alias=True)
    now = datetime.now(UTC)
    await JobDispatchOutboxRecord.create(
        job_id=job.id,
        dispatch_sequence=dispatch_sequence,
        task_name=job.task_name,
        message_schema_version=envelope.message_schema_version,
        envelope=serialized,
        envelope_hash=hash_json(serialized),
        status=JobDispatchStatus.DISPATCHED,
        workload_class=job.workload_class,
        available_at=now,
        dispatch_attempt_count=1,
        dispatched_at=now,
        task_message_id=f"{_TRANSPORT_MESSAGE_ID}-{dispatch_sequence}",
    )
    return envelope


async def _claim_attempt(
    *,
    service: BackgroundJobExecutionService,
    job: BackgroundJobRecord,
    envelope: JobDispatchEnvelope,
    worker_id: str,
) -> JobExecutionLease:
    claim = await service.accept_delivery(
        JobDeliveryCommand(
            task_name=job.task_name,
            envelope=envelope,
            worker_id=worker_id,
            transport_message_id=f"{_TRANSPORT_MESSAGE_ID}-{envelope.dispatch_sequence}",
            received_at=datetime.now(UTC),
        )
    )
    assert claim.disposition == JobDeliveryDisposition.CLAIMED
    assert claim.lease is not None
    return claim.lease


def _execution_context(
    *,
    scenario: _Scenario,
    lease: JobExecutionLease,
) -> FencedJobExecutionContext:
    source_revision = scenario.subject.job.source_revision
    assert source_revision is not None
    return FencedJobExecutionContext(
        execution=scenario.execution,
        idempotency_namespace="asset-thumbnail-provider-effect-race",
        lease=lease,
        target=scenario.subject.target,
        input_reference=scenario.subject.input_reference,
        source_revision=source_revision,
        request_fingerprint=scenario.subject.job.request_fingerprint,
        raise_on_cancellation=True,
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


def _png_bytes() -> bytes:
    payload = BytesIO()
    Image.new("RGB", (640, 360), color="navy").save(payload, format="PNG")
    return payload.getvalue()


async def _create_storage_profile(
    *,
    settings: Settings,
    bucket: str,
) -> tuple[StorageProfile, StorageProfileRouteBinding]:
    token = uuid4().hex
    profile = await StorageProfile.create(
        profile_key=f"thumbnail-race-{token}",
        provider=ObjectStorageProviderKind.AWS_S3,
        config_source=StorageProfileConfigSource.DATABASE,
        display_name="Thumbnail Provider Effect Race",
        config={
            "region": "us-east-1",
            "bucket": bucket,
            "public_delivery_mode": "direct",
            "access_key_id": "initial-access-key",
        },
        secret_ref={"secret_access_key": "initial-secret"},
        is_active=True,
        is_default=False,
    )
    binding = await StorageProfileRouteService(settings).materialize_by_key(
        profile_key=profile.profile_key,
    )
    return profile, binding


async def _create_source_asset(
    *,
    workspace_public_id: str,
    project_id: UUID,
    asset_id: UUID,
    profile_key: str,
    bucket: str,
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
            storage_provider=ObjectStorageProviderKind.AWS_S3,
            storage_profile_key=profile_key,
            storage_bucket=bucket,
            using_db=conn,
        )


async def _create_scenario(
    *,
    settings: Settings,
    workspace_public_id: str,
    workspace_id: UUID,
    project_id: UUID,
    scratch_root: Path,
    checksum: str,
    job_repository: BackgroundJobRepository | None = None,
) -> _Scenario:
    state = _ObjectStoreState()
    bucket = f"thumbnail-race-{uuid4().hex}"
    profile, binding = await _create_storage_profile(settings=settings, bucket=bucket)
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    state.seed(bucket=bucket, object_key=source_key, data=_png_bytes())
    await _create_source_asset(
        workspace_public_id=workspace_public_id,
        project_id=project_id,
        asset_id=asset_id,
        profile_key=profile.profile_key,
        bucket=bucket,
        object_key=source_key,
        checksum=checksum,
    )
    tenant_context = await _tenant_context(workspace_id=workspace_id, project_id=project_id)
    repository = job_repository or BackgroundJobRepository()
    execution, definition = _build_execution_service(settings, repository)
    subject = await _create_public_job_subject(
        service=execution,
        definition=definition,
        workspace_id=workspace_id,
        project_id=project_id,
        asset_id=asset_id,
        source_revision=checksum,
    )
    return _Scenario(
        settings=settings,
        profile=profile,
        binding=binding,
        state=state,
        bucket=bucket,
        source_key=source_key,
        asset_id=asset_id,
        project_id=project_id,
        tenant_repository=TenantAssetThumbnailRepository(
            tenant_context_provider=lambda: tenant_context,
        ),
        job_repository=repository,
        execution=execution,
        subject=subject,
        scratch_root=scratch_root,
    )


def _build_domain_runtime(
    scenario: _Scenario,
    *,
    effect_repository: ProviderEffectRepository | None = None,
    pipeline: _RecordingThumbnailPipeline | None = None,
) -> _DomainRuntime:
    service = ProviderEffectService(
        scenario.settings,
        job_repository=scenario.job_repository,
        effect_repository=effect_repository,
        contracts=ProviderEffectContractRegistry((build_asset_thumbnail_provider_effect_contract(),)),
    )
    effects = AssetThumbnailProviderEffectCoordinator(operations=service)
    storage = ExactAssetThumbnailProviderStorageResolver(
        scenario.settings,
        route_operations=service,
        provider_builder=scenario.state.build_provider,
    )
    selected_pipeline = pipeline or _RecordingThumbnailPipeline(
        scratch_root=scenario.scratch_root,
        storage_resolver=storage,
    )
    return _DomainRuntime(
        service=service,
        effects=effects,
        storage=storage,
        pipeline=selected_pipeline,
        handler=AssetThumbnailJobHandler(
            repository=scenario.tenant_repository,
            pipeline=selected_pipeline,
            effects=effects,
            storage=storage,
        ),
    )


async def _register_single_output(
    *,
    scenario: _Scenario,
    runtime: _DomainRuntime,
) -> AssetThumbnailProviderEffectEvidence:
    object_key = (
        f"projects/{scenario.project_id}/assets/{scenario.asset_id}/thumbnails/"
        f"v{ASSET_THUMBNAIL_PROFILE_VERSION}/{scenario.subject.job.id}/thumb-{_THUMBNAIL_WIDTH}.jpg"
    )
    source_revision = scenario.subject.job.source_revision
    assert source_revision is not None
    evidence = await runtime.effects.register_outputs(
        lease=scenario.subject.first_lease,
        route=scenario.binding,
        manifest=AssetThumbnailProviderEffectManifestV1(
            job_id=scenario.subject.job.id,
            project_id=scenario.project_id,
            asset_id=scenario.asset_id,
            request_fingerprint=scenario.subject.job.request_fingerprint,
            source_revision=source_revision,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
            target_bucket=scenario.bucket,
            outputs=(
                AssetThumbnailProviderOutputV1(
                    width=_THUMBNAIL_WIDTH,
                    object_key=object_key,
                ),
            ),
        ),
    )
    scenario.state.seed(bucket=scenario.bucket, object_key=object_key)
    return evidence


async def _commit_marker(
    *,
    scenario: _Scenario,
    evidence: AssetThumbnailProviderEffectEvidence,
) -> None:
    source_revision = scenario.subject.job.source_revision
    assert source_revision is not None
    outputs = evidence.manifest.outputs
    await scenario.tenant_repository.commit_outcome(
        write=AssetThumbnailOutcomeWrite(
            job_id=scenario.subject.job.id,
            project_id=scenario.project_id,
            asset_id=scenario.asset_id,
            request_fingerprint=scenario.subject.job.request_fingerprint,
            output_identity=evidence.output_identity,
            source_revision=source_revision,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
            produced_widths=tuple(output.width for output in outputs),
            variants={
                "thumbnails": [
                    {
                        "width": output.width,
                        "object_key": output.object_key,
                        "mime": "image/jpeg",
                        "ext": "jpg",
                    }
                    for output in outputs
                ]
            },
            meta={},
        )
    )


async def _expire_first_and_claim_retry(*, scenario: _Scenario) -> JobExecutionLease:
    repository = scenario.job_repository
    async with in_transaction() as conn:
        job = await repository.get_job_for_update(job_id=scenario.subject.job.id, conn=conn)
        attempt = await repository.get_attempt_for_update(
            attempt_id=scenario.subject.first_lease.attempt_id,
            conn=conn,
        )
        assert job is not None
        assert attempt is not None
        database_now = await repository.get_database_time(conn=conn)
        await repository.finish_attempt(
            attempt=attempt,
            status=JobAttemptStatus.LEASE_EXPIRED,
            completed_at=database_now,
            failure=None,
            conn=conn,
        )
        await repository.update_job_fields(
            job=job,
            fields={
                "internal_status": JobInternalStatus.RETRY_SCHEDULED,
                "next_attempt_at": database_now,
            },
            conn=conn,
        )
    return await _claim_attempt(
        service=scenario.execution,
        job=scenario.subject.job,
        envelope=scenario.subject.second_envelope,
        worker_id="thumbnail-race-worker-2",
    )


async def _request_cancellation(*, scenario: _Scenario) -> None:
    async with in_transaction() as conn:
        cancelled_at = await scenario.job_repository.get_database_time(conn=conn)
    await BackgroundJobRecord.filter(id=scenario.subject.job.id).update(
        cancel_requested_at=cancelled_at,
        cancel_reason="verify provider effect cancellation reconciliation",
    )


async def _wait_for_postgres_lock(*, backend_pid: int) -> None:
    for _ in range(_LOCK_PROBE_ATTEMPTS):
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict(
                "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
                [backend_pid],
            )
        if rows and rows[0].get("wait_event_type") == "Lock":
            return
        await asyncio.sleep(_LOCK_PROBE_INTERVAL_SECONDS)
    raise AssertionError(f"PostgreSQL backend {backend_pid} never entered a lock wait")


async def _wait_until_database_time(*, target: datetime) -> None:
    repository = BackgroundJobRepository()
    for _ in range(_LOCK_PROBE_ATTEMPTS):
        async with in_transaction() as conn:
            observed_at = await repository.get_database_time(conn=conn)
        if observed_at >= target:
            return
        await asyncio.sleep(_LOCK_PROBE_INTERVAL_SECONDS)
    raise AssertionError(f"PostgreSQL clock did not reach {target.isoformat()}")


def _configure_test_settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Settings:
    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(tmp_path / "unused-local-root"))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(tmp_path / "unused-local-tmp"))
    get_settings.cache_clear()
    return get_settings()


@pytest.mark.asyncio
async def test_marker_commit_wins_and_retry_settles_active_effect_without_provider_delete(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_test_settings(monkeypatch, tmp_path)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        workspace_id = decode_public_id(workspace_public_id)
        project_id = decode_public_id(project_public_id)
        scenario = await _create_scenario(
            settings=settings,
            workspace_public_id=workspace_public_id,
            workspace_id=workspace_id,
            project_id=project_id,
            scratch_root=tmp_path / "scratch",
            checksum="a" * 64,
        )
        runtime = _build_domain_runtime(scenario)
        evidence = await _register_single_output(scenario=scenario, runtime=runtime)
        await _commit_marker(scenario=scenario, evidence=evidence)
        retry_lease = await _expire_first_and_claim_retry(scenario=scenario)

        result = await runtime.handler.reconcile(context=_execution_context(scenario=scenario, lease=retry_lease))

        persisted = await ProviderEffectRecord.get(id=evidence.effect.id)
        assert result is not None
        assert result.outcome_job_id == scenario.subject.job.id
        assert persisted.disposition == ProviderEffectDisposition.COMMITTED
        assert persisted.settled_by_attempt_id == retry_lease.attempt_id
        assert persisted.settlement_reference["kind"] == "committed"
        assert persisted.settlement_reference["output_identity"] == evidence.output_identity
        assert scenario.state.contains(
            bucket=scenario.bucket,
            object_key=evidence.manifest.outputs[0].object_key,
        )
        assert scenario.state.delete_calls == []


@pytest.mark.asyncio
async def test_marker_absent_replacement_cleans_exact_old_outputs_and_preserves_sentinel(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_test_settings(monkeypatch, tmp_path)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        scenario = await _create_scenario(
            settings=settings,
            workspace_public_id=workspace_public_id,
            workspace_id=decode_public_id(workspace_public_id),
            project_id=decode_public_id(project_public_id),
            scratch_root=tmp_path / "scratch",
            checksum="b" * 64,
        )
        runtime = _build_domain_runtime(scenario)
        evidence = await _register_single_output(scenario=scenario, runtime=runtime)
        sentinel_key = (
            f"projects/{scenario.project_id}/assets/{scenario.asset_id}/thumbnails/"
            f"v1/{scenario.subject.job.id}/keep.txt"
        )
        scenario.state.seed(bucket=scenario.bucket, object_key=sentinel_key, data=b"sentinel")
        retry_lease = await _expire_first_and_claim_retry(scenario=scenario)

        result = await runtime.handler.reconcile(context=_execution_context(scenario=scenario, lease=retry_lease))

        output_key = evidence.manifest.outputs[0].object_key
        persisted = await ProviderEffectRecord.get(id=evidence.effect.id)
        assert result is None
        assert persisted.disposition == ProviderEffectDisposition.CLEANED
        assert persisted.settled_by_attempt_id == retry_lease.attempt_id
        assert persisted.settlement_reference["kind"] == "cleaned"
        assert scenario.state.delete_calls == [(scenario.bucket, output_key)]
        assert not scenario.state.contains(bucket=scenario.bucket, object_key=output_key)
        assert scenario.state.contains(bucket=scenario.bucket, object_key=sentinel_key)
        assert scenario.state.contains(bucket=scenario.bucket, object_key=scenario.source_key)


@pytest.mark.asyncio
async def test_delete_then_failed_cleaned_settlement_retries_typed_not_found_to_cleaned(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_test_settings(monkeypatch, tmp_path)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        scenario = await _create_scenario(
            settings=settings,
            workspace_public_id=workspace_public_id,
            workspace_id=decode_public_id(workspace_public_id),
            project_id=decode_public_id(project_public_id),
            scratch_root=tmp_path / "scratch",
            checksum="c" * 64,
        )
        failing_repository = _FailFirstSettlementRepository(disposition=ProviderEffectDisposition.CLEANED)
        failing_runtime = _build_domain_runtime(
            scenario,
            effect_repository=failing_repository,
        )
        evidence = await _register_single_output(scenario=scenario, runtime=failing_runtime)
        retry_lease = await _expire_first_and_claim_retry(scenario=scenario)
        context = _execution_context(scenario=scenario, lease=retry_lease)
        output_key = evidence.manifest.outputs[0].object_key

        with pytest.raises(RuntimeError, match="injected cleaned settlement failure"):
            await failing_runtime.handler.reconcile(context=context)

        persisted_after_failure = await ProviderEffectRecord.get(id=evidence.effect.id)
        assert failing_repository.failed is True
        assert persisted_after_failure.disposition == ProviderEffectDisposition.ACTIVE
        assert not scenario.state.contains(bucket=scenario.bucket, object_key=output_key)
        assert scenario.state.delete_calls == [(scenario.bucket, output_key)]

        retry_runtime = _build_domain_runtime(scenario)
        assert await retry_runtime.handler.reconcile(context=context) is None

        persisted = await ProviderEffectRecord.get(id=evidence.effect.id)
        assert persisted.disposition == ProviderEffectDisposition.CLEANED
        assert scenario.state.delete_calls == [
            (scenario.bucket, output_key),
            (scenario.bucket, output_key),
        ]
        assert scenario.state.not_found_delete_calls == [(scenario.bucket, output_key)]


@pytest.mark.asyncio
async def test_marker_committed_then_failed_committed_settlement_retries_without_reexecution(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_test_settings(monkeypatch, tmp_path)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        scenario = await _create_scenario(
            settings=settings,
            workspace_public_id=workspace_public_id,
            workspace_id=decode_public_id(workspace_public_id),
            project_id=decode_public_id(project_public_id),
            scratch_root=tmp_path / "scratch",
            checksum="d" * 64,
        )
        failing_repository = _FailFirstSettlementRepository(disposition=ProviderEffectDisposition.COMMITTED)
        failing_runtime = _build_domain_runtime(
            scenario,
            effect_repository=failing_repository,
        )
        first_context = _execution_context(
            scenario=scenario,
            lease=scenario.subject.first_lease,
        )

        with pytest.raises(RuntimeError, match="injected committed settlement failure"):
            await failing_runtime.handler.execute(context=first_context)

        marker = await scenario.tenant_repository.get_outcome_marker(
            project_id=scenario.project_id,
            asset_id=scenario.asset_id,
        )
        effect = await ProviderEffectRecord.get(job_id=scenario.subject.job.id)
        put_calls = list(scenario.state.put_calls)
        assert marker is not None
        assert effect.disposition == ProviderEffectDisposition.ACTIVE
        assert failing_runtime.pipeline.execute_calls == 1
        assert put_calls
        assert scenario.state.delete_calls == []

        retry_lease = await _expire_first_and_claim_retry(scenario=scenario)
        retry_runtime = _build_domain_runtime(
            scenario,
            pipeline=failing_runtime.pipeline,
        )
        result = await retry_runtime.handler.reconcile(context=_execution_context(scenario=scenario, lease=retry_lease))

        await effect.refresh_from_db()
        assert result is not None
        assert effect.disposition == ProviderEffectDisposition.COMMITTED
        assert effect.settled_by_attempt_id == retry_lease.attempt_id
        assert failing_runtime.pipeline.execute_calls == 1
        assert scenario.state.put_calls == put_calls
        assert scenario.state.delete_calls == []


@pytest.mark.asyncio
async def test_route_update_tombstone_and_credential_rotation_keep_identity_and_clean_old_revision(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_test_settings(monkeypatch, tmp_path)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        scenario = await _create_scenario(
            settings=settings,
            workspace_public_id=workspace_public_id,
            workspace_id=decode_public_id(workspace_public_id),
            project_id=decode_public_id(project_public_id),
            scratch_root=tmp_path / "scratch",
            checksum="e" * 64,
        )
        runtime = _build_domain_runtime(scenario)
        evidence = await _register_single_output(scenario=scenario, runtime=runtime)

        rotated_config = dict(scenario.profile.config)
        rotated_config["access_key_id"] = "rotated-access-key"
        await StorageProfile.filter(id=scenario.profile.id).update(
            config=rotated_config,
            secret_ref={"secret_access_key": "rotated-secret"},
        )
        credential_binding = await runtime.service.materialize_storage_profile_route(
            profile_key=scenario.profile.profile_key
        )
        listed_after_rotation = await runtime.effects.list_effects(lease=scenario.subject.first_lease)
        assert credential_binding == scenario.binding
        assert listed_after_rotation[0].output_identity == evidence.output_identity

        next_bucket = f"thumbnail-race-next-{uuid4().hex}"
        rotated_config["bucket"] = next_bucket
        await StorageProfile.filter(id=scenario.profile.id).update(config=rotated_config)
        next_binding = await runtime.service.materialize_storage_profile_route(profile_key=scenario.profile.profile_key)
        async with in_transaction() as conn:
            tombstoned_at = await StorageProfileRouteRepository().get_database_time(conn=conn)
        await StorageProfile.filter(id=scenario.profile.id).update(
            is_active=False,
            tombstoned_at=tombstoned_at,
        )
        sentinel_key = "new-revision-sentinel.txt"
        scenario.state.seed(bucket=next_bucket, object_key=sentinel_key, data=b"sentinel")
        retry_lease = await _expire_first_and_claim_retry(scenario=scenario)

        assert await runtime.handler.reconcile(context=_execution_context(scenario=scenario, lease=retry_lease)) is None

        output_key = evidence.manifest.outputs[0].object_key
        persisted = await ProviderEffectRecord.get(id=evidence.effect.id)
        assert next_binding.profile_revision_id != scenario.binding.profile_revision_id
        assert persisted.profile_revision_id == scenario.binding.profile_revision_id
        assert persisted.disposition == ProviderEffectDisposition.CLEANED
        assert scenario.state.delete_calls == [(scenario.bucket, output_key)]
        assert scenario.state.delete_credentials == [("rotated-access-key", "rotated-secret")]
        assert scenario.state.contains(bucket=next_bucket, object_key=sentinel_key)


@pytest.mark.asyncio
async def test_hard_deleted_asset_still_cleans_through_public_provider_effect_foreign_keys(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_test_settings(monkeypatch, tmp_path)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        scenario = await _create_scenario(
            settings=settings,
            workspace_public_id=workspace_public_id,
            workspace_id=decode_public_id(workspace_public_id),
            project_id=decode_public_id(project_public_id),
            scratch_root=tmp_path / "scratch",
            checksum="f" * 64,
        )
        runtime = _build_domain_runtime(scenario)
        evidence = await _register_single_output(scenario=scenario, runtime=runtime)
        async with _tenant_conn(workspace_public_id) as conn:
            assert await AssetRecord.filter(id=scenario.asset_id).using_db(conn).delete() == 1
        assert await ProviderEffectRecord.filter(id=evidence.effect.id).exists()
        retry_lease = await _expire_first_and_claim_retry(scenario=scenario)

        assert await runtime.handler.reconcile(context=_execution_context(scenario=scenario, lease=retry_lease)) is None

        persisted = await ProviderEffectRecord.get(id=evidence.effect.id)
        assert persisted.disposition == ProviderEffectDisposition.CLEANED
        assert not scenario.state.contains(
            bucket=scenario.bucket,
            object_key=evidence.manifest.outputs[0].object_key,
        )
        assert scenario.state.contains(bucket=scenario.bucket, object_key=scenario.source_key)


@pytest.mark.asyncio
async def test_cancellation_context_lists_deletes_and_settles_active_effect(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_test_settings(monkeypatch, tmp_path)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        scenario = await _create_scenario(
            settings=settings,
            workspace_public_id=workspace_public_id,
            workspace_id=decode_public_id(workspace_public_id),
            project_id=decode_public_id(project_public_id),
            scratch_root=tmp_path / "scratch",
            checksum="1" * 64,
        )
        runtime = _build_domain_runtime(scenario)
        evidence = await _register_single_output(scenario=scenario, runtime=runtime)
        await _request_cancellation(scenario=scenario)
        cancellation_context = _execution_context(
            scenario=scenario,
            lease=scenario.subject.first_lease,
        ).with_cancellation_signals(enabled=False)

        await runtime.handler.cancel(context=cancellation_context)

        persisted = await ProviderEffectRecord.get(id=evidence.effect.id)
        job = await BackgroundJobRecord.get(id=scenario.subject.job.id)
        assert job.cancel_requested_at is not None
        assert persisted.disposition == ProviderEffectDisposition.CLEANED
        assert persisted.settled_by_attempt_id == scenario.subject.first_lease.attempt_id
        assert scenario.state.delete_calls == [(scenario.bucket, evidence.manifest.outputs[0].object_key)]


@pytest.mark.asyncio
async def test_effect_row_lock_outlives_lease_and_blocks_all_provider_mutation(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _configure_test_settings(monkeypatch, tmp_path)
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        _client,
        workspace_public_id,
        project_public_id,
    ):
        scenario = await _create_scenario(
            settings=settings,
            workspace_public_id=workspace_public_id,
            workspace_id=decode_public_id(workspace_public_id),
            project_id=decode_public_id(project_public_id),
            scratch_root=tmp_path / "scratch",
            checksum="2" * 64,
        )
        registration_runtime = _build_domain_runtime(scenario)
        evidence = await _register_single_output(
            scenario=scenario,
            runtime=registration_runtime,
        )
        async with in_transaction() as conn:
            observed_at = await scenario.job_repository.get_database_time(conn=conn)
            lease_expires_at = observed_at + timedelta(seconds=2)
            await (
                JobAttemptRecord
                .filter(id=scenario.subject.first_lease.attempt_id)
                .using_db(conn)
                .update(lease_until=lease_expires_at)
            )

        effect_locked = asyncio.Event()
        release_effect = asyncio.Event()
        blocker_pids: set[int] = set()

        async def hold_effect_row_lock() -> None:
            async with in_transaction() as conn:
                rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
                blocker_pids.add(int(rows[0]["pid"]))
                locked = (
                    await ProviderEffectRecord.filter(id=evidence.effect.id).using_db(conn).select_for_update().first()
                )
                assert locked is not None
                effect_locked.set()
                await release_effect.wait()

        blocker_task = asyncio.create_task(hold_effect_row_lock())
        await asyncio.wait_for(effect_locked.wait(), timeout=_SYNC_TIMEOUT_SECONDS)
        probe_repository = _ListingEffectLockProbeRepository()
        runtime = _build_domain_runtime(
            scenario,
            effect_repository=probe_repository,
        )
        reconcile_task = asyncio.create_task(
            runtime.handler.reconcile(
                context=_execution_context(
                    scenario=scenario,
                    lease=scenario.subject.first_lease,
                )
            )
        )
        try:
            await asyncio.wait_for(
                probe_repository.requested.wait(),
                timeout=_SYNC_TIMEOUT_SECONDS,
            )
            waiting_pid = next(iter(probe_repository.backend_pids))
            await _wait_for_postgres_lock(backend_pid=waiting_pid)
            assert waiting_pid not in blocker_pids
            await _wait_until_database_time(target=lease_expires_at)
        finally:
            release_effect.set()
            await blocker_task

        with pytest.raises(JobExecutionLeaseLostError):
            await reconcile_task
        persisted = await ProviderEffectRecord.get(id=evidence.effect.id)
        assert persisted.disposition == ProviderEffectDisposition.ACTIVE
        assert scenario.state.put_calls == []
        assert scenario.state.delete_calls == []
        assert scenario.state.contains(
            bucket=scenario.bucket,
            object_key=evidence.manifest.outputs[0].object_key,
        )
