from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAttemptStatus,
    JobAuthorityMode,
    JobDispatchOutboxRecord,
    JobDispatchStatus,
    JobInternalStatus,
    JobRetryClass,
    JobWorkloadClass,
)
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.models.storage.storage_profile import (
    StorageProfile,
    StorageProfileConfigSource,
    StorageProfileRouteRevision,
)
from src.modules.jobs.execution_errors import (
    JobExecutionLeaseLostError,
    JobExecutionStateInvariantError,
)
from src.modules.jobs.execution_schema import JobExecutionLease
from src.modules.jobs.execution_validation import to_execution_lease
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_contracts import (
    ProviderEffectContractRegistry,
    PydanticProviderEffectContract,
)
from src.modules.jobs.provider_effect_errors import (
    ProviderEffectRegistrationError,
    ProviderEffectRegistrationProfileUnavailableError,
    ProviderEffectRegistrationRouteStaleError,
)
from src.modules.jobs.provider_effect_recovery import (
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
    PROVIDER_EFFECT_RECOVERY_TASK_NAME,
    ProviderEffectRecoveryTarget,
)
from src.modules.jobs.provider_effect_recovery_repository import ProviderEffectRecoveryRepository
from src.modules.jobs.provider_effect_recovery_service import ProviderEffectRecoveryEnqueueService
from src.modules.jobs.provider_effect_repository import ProviderEffectRepository
from src.modules.jobs.provider_effect_schema import ProviderEffectRegistration, ProviderEffectSettlement
from src.modules.jobs.provider_effect_service import ProviderEffectService
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.retry import JobRetryPolicy
from src.modules.system.storage_profiles.schema import (
    StorageProfileConfigPayload,
    StorageProfileUpdateRequest,
)
from src.modules.system.storage_profiles.service import StorageProfilesService
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_route_repository import StorageProfileRouteRepository
from src.platform.storage.profile_route_service import StorageProfileRouteInvariantError, StorageProfileRouteService
from src.platform.storage.profile_routes import StorageProfileRouteBinding

pytestmark = pytest.mark.integration

LOCK_PROBE_TIMEOUT_SECONDS = 5.0


class EffectManifestContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    marker: str
    object_keys: tuple[str, ...]


class CommittedReferenceContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    marker_revision: str


class CleanedReferenceContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cleanup_run_id: str


def _contracts() -> ProviderEffectContractRegistry:
    return ProviderEffectContractRegistry([
        PydanticProviderEffectContract(
            effect_type="asset.thumbnail.objects",
            schema_version=1,
            manifest_model=EffectManifestContract,
            settlement_models={
                ProviderEffectDisposition.COMMITTED: CommittedReferenceContract,
                ProviderEffectDisposition.CLEANED: CleanedReferenceContract,
            },
        )
    ])


def _effect_service(
    subject: EffectSubject,
    *,
    route_repository: StorageProfileRouteRepository | None = None,
    effect_repository: ProviderEffectRepository | None = None,
    job_repository: BackgroundJobRepository | None = None,
) -> ProviderEffectService:
    return ProviderEffectService(
        subject.settings,
        route_repository=route_repository,
        effect_repository=effect_repository,
        job_repository=job_repository,
        contracts=_contracts(),
    )


@dataclass(frozen=True, slots=True)
class EffectSubject:
    settings: Settings
    profile: StorageProfile
    binding: StorageProfileRouteBinding
    job: BackgroundJobRecord
    attempt: JobAttemptRecord
    lease: JobExecutionLease


class ProfileLockProbeRepository(StorageProfileRouteRepository):
    def __init__(self, *, hold_after_acquire: bool) -> None:
        super().__init__()
        self.hold_after_acquire = hold_after_acquire
        self.requested = asyncio.Event()
        self.acquired = asyncio.Event()
        self.release = asyncio.Event()
        self.backend_pids: set[int] = set()
        self._held_once = False

    async def get_profile_for_update(
        self,
        *,
        profile_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> StorageProfile | None:
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))
        self.requested.set()
        profile = await super().get_profile_for_update(profile_id=profile_id, conn=conn)
        self.acquired.set()
        if self.hold_after_acquire and not self._held_once:
            self._held_once = True
            await self.release.wait()
        return profile


class RevisionInsertProbeRepository(StorageProfileRouteRepository):
    def __init__(self) -> None:
        super().__init__()
        self.revision_inserted = asyncio.Event()
        self.release = asyncio.Event()

    async def create_route_revision(self, **kwargs):  # type: ignore[no-untyped-def]
        revision = await super().create_route_revision(**kwargs)
        self.revision_inserted.set()
        await self.release.wait()
        return revision


class CountingEffectRepository(ProviderEffectRepository):
    def __init__(self) -> None:
        super().__init__()
        self.active_cas_count = 0

    async def settle_active_effect(self, **kwargs):  # type: ignore[no-untyped-def]
        self.active_cas_count += 1
        return await super().settle_active_effect(**kwargs)


class ListingEffectLockProbeRepository(ProviderEffectRepository):
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


class ResolutionEffectProbeRepository(ProviderEffectRepository):
    def __init__(self) -> None:
        super().__init__()
        self.backend_pids: set[int] = set()

    async def get_effect(
        self,
        *,
        effect_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ProviderEffectRecord | None:
        assert conn is not None
        await self._remember_backend_pid(conn)
        return await super().get_effect(effect_id=effect_id, conn=conn)

    async def get_effect_by_id_for_update(
        self,
        *,
        effect_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ProviderEffectRecord | None:
        await self._remember_backend_pid(conn)
        return await super().get_effect_by_id_for_update(effect_id=effect_id, conn=conn)

    async def _remember_backend_pid(self, conn: BaseDBAsyncClient) -> None:
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))


class JobLockProbeRepository(BackgroundJobRepository):
    def __init__(self) -> None:
        super().__init__()
        self.requested = asyncio.Event()
        self.acquired = asyncio.Event()
        self.backend_pids: set[int] = set()

    async def get_job_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobRecord | None:
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        self.backend_pids.add(int(rows[0]["pid"]))
        self.requested.set()
        job = await super().get_job_for_update(job_id=job_id, conn=conn)
        self.acquired.set()
        return job


async def _wait_for_postgres_lock_wait(*, backend_pid: int) -> None:
    for _ in range(500):
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict(
                "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
                [backend_pid],
            )
        if rows and rows[0].get("wait_event_type") == "Lock":
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"PostgreSQL backend {backend_pid} never entered a lock wait")


async def _wait_until_database_time_reaches(*, target: datetime) -> None:
    repository = BackgroundJobRepository()
    for _ in range(500):
        async with in_transaction() as conn:
            observed_at = await repository.get_database_time(conn=conn)
        if observed_at >= target:
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"PostgreSQL clock did not reach {target.isoformat()}")


async def _create_subject(
    *,
    provider: ObjectStorageProviderKind = ObjectStorageProviderKind.AWS_S3,
) -> EffectSubject:
    settings = get_settings()
    token = uuid4().hex
    config: dict[str, object]
    if provider == ObjectStorageProviderKind.LOCAL:
        config = {}
    else:
        config = {
            "endpoint_url": "https://storage.example.com",
            "region": "us-east-1",
            "bucket": f"assets-{token}",
            "force_path_style": True,
            "public_delivery_mode": "direct",
            "presign_expires_seconds": 1800,
            "access_key_id": "current-access-key",
        }
    profile = await StorageProfile.create(
        profile_key=f"effect-{token}",
        provider=provider.value,
        config_source=StorageProfileConfigSource.DATABASE,
        display_name="Effect Test Profile",
        config=config,
        secret_ref={"secret_access_key": "current-secret"} if provider != ObjectStorageProviderKind.LOCAL else {},
        is_active=True,
        is_default=False,
    )
    binding = await StorageProfileRouteService(settings).materialize_by_key(profile_key=profile.profile_key)
    job, attempt, lease = await _create_execution_subject()
    return EffectSubject(
        settings=settings,
        profile=profile,
        binding=binding,
        job=job,
        attempt=attempt,
        lease=lease,
    )


async def _create_execution_subject(
    *,
    job_type: str = "test.provider-effect",
    job_type_version: int = 1,
    task_name: str = "jobs:maintenance:test-provider-effect:v1",
    target_descriptor: dict[str, object] | None = None,
) -> tuple[BackgroundJobRecord, JobAttemptRecord, JobExecutionLease]:
    token = uuid4().hex
    policy = JobRetryPolicy(
        max_attempts=1,
        initial_delay_seconds=1,
        multiplier=2,
        maximum_delay_seconds=1,
    )
    job = await BackgroundJobRecord.create(
        job_type=job_type,
        job_type_version=job_type_version,
        task_name=task_name,
        workload_class=JobWorkloadClass.MAINTENANCE,
        internal_status=JobInternalStatus.RUNNING,
        retry_class=JobRetryClass.NONE,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        target_descriptor=target_descriptor if target_descriptor is not None else {},
        input_reference={},
        idempotency_scope_key=f"system:{token}",
        idempotency_key_hash=hash_json({"idempotency": token}),
        request_fingerprint=hash_json({"request": token}),
        source_revision=f"source:{token}",
        correlation_id=f"provider-effect-{token}",
        phase="running",
        attempt_count=1,
        retry_policy=policy.model_dump(mode="json", by_alias=True),
        lease_seconds=60,
        heartbeat_seconds=10,
    )
    repository = BackgroundJobRepository()
    async with in_transaction() as conn:
        now = await repository.get_database_time(conn=conn)
    dispatch = await JobDispatchOutboxRecord.create(
        job_id=job.id,
        dispatch_sequence=1,
        task_name=job.task_name,
        message_schema_version=1,
        envelope={"job_id": str(job.id)},
        envelope_hash=hash_json({"job_id": str(job.id)}),
        status=JobDispatchStatus.DISPATCHED,
        workload_class=job.workload_class,
        available_at=now,
        dispatched_at=now,
        task_message_id=f"message-{token}",
    )
    attempt = await JobAttemptRecord.create(
        job_id=job.id,
        dispatch_id=dispatch.id,
        attempt_number=1,
        fencing_token=uuid4(),
        status=JobAttemptStatus.RUNNING,
        worker_id=f"worker-{token}",
        handler_version=1,
        claimed_at=now,
        lease_until=now + timedelta(minutes=5),
        heartbeat_at=now,
        timeout_at=now + timedelta(minutes=10),
        started_at=now,
    )
    return job, attempt, to_execution_lease(job=job, attempt=attempt, dispatch_sequence=1)


def _registration(
    subject: EffectSubject,
    *,
    effect_key: str = "thumbnail-profile-v1",
    marker: str = "original",
) -> ProviderEffectRegistration:
    return ProviderEffectRegistration(
        route=subject.binding,
        effect_type="asset.thumbnail.objects",
        effect_key=effect_key,
        schema_version=1,
        manifest={
            "marker": marker,
            "object_keys": [f"projects/{subject.job.id}/thumbnail.webp"],
        },
    )


async def test_registration_exact_replay_and_manifest_conflict(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    registration = _registration(subject)

    first, _ = await service.register_effect(lease=subject.lease, registration=registration)
    replay, _ = await service.register_effect(lease=subject.lease, registration=registration)

    assert replay == first
    assert await ProviderEffectRecord.filter(job_id=subject.job.id).count() == 1
    with pytest.raises(JobExecutionStateInvariantError, match="cannot replace existing evidence"):
        await service.register_effect(
            lease=subject.lease,
            registration=_registration(subject, marker="different"),
        )


async def test_unknown_or_cross_contract_evidence_never_mutates_ledger(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    registration = _registration(subject)

    with pytest.raises(JobExecutionStateInvariantError, match="Unknown provider effect contract"):
        await ProviderEffectService(subject.settings).register_effect(
            lease=subject.lease,
            registration=registration,
        )
    with pytest.raises(JobExecutionStateInvariantError, match="Unknown provider effect contract"):
        await _effect_service(subject).register_effect(
            lease=subject.lease,
            registration=registration.model_copy(update={"schema_version": 2}),
        )
    with pytest.raises(JobExecutionStateInvariantError, match="manifest does not match"):
        await _effect_service(subject).register_effect(
            lease=subject.lease,
            registration=ProviderEffectRegistration(
                route=subject.binding,
                effect_type="asset.thumbnail.objects",
                effect_key="thumbnail-profile-v1",
                schema_version=1,
                manifest={
                    "marker": "original",
                    "object_keys": ["safe"],
                    "unexpected_domain_field": "wrong-contract",
                },
            ),
        )
    assert await ProviderEffectRecord.filter(job_id=subject.job.id).count() == 0


async def test_invalid_settlement_contract_does_not_settle_active_effect(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))

    with pytest.raises(JobExecutionStateInvariantError, match="settlement does not match"):
        await service.settle_effects(
            lease=subject.lease,
            settlement=ProviderEffectSettlement(
                effect_ids=(effect.id,),
                disposition=ProviderEffectDisposition.CLEANED,
                settlement_reference={"marker_revision": "wrong-disposition"},
            ),
        )
    assert (await ProviderEffectRecord.get(id=effect.id)).disposition == ProviderEffectDisposition.ACTIVE


async def test_list_effects_returns_all_dispositions_in_stable_registration_order(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    active, _ = await service.register_effect(
        lease=subject.lease,
        registration=_registration(subject, effect_key="active-effect"),
    )
    committed, _ = await service.register_effect(
        lease=subject.lease,
        registration=_registration(subject, effect_key="committed-effect"),
    )
    cleaned, _ = await service.register_effect(
        lease=subject.lease,
        registration=_registration(subject, effect_key="cleaned-effect"),
    )
    await service.settle_effects(
        lease=subject.lease,
        settlement=ProviderEffectSettlement(
            effect_ids=(committed.id,),
            disposition=ProviderEffectDisposition.COMMITTED,
            settlement_reference={"marker_revision": "committed-v1"},
        ),
    )
    await service.settle_effects(
        lease=subject.lease,
        settlement=ProviderEffectSettlement(
            effect_ids=(cleaned.id,),
            disposition=ProviderEffectDisposition.CLEANED,
            settlement_reference={"cleanup_run_id": "cleaned-v1"},
        ),
    )
    await ProviderEffectRecord.filter(id=committed.id).update(registered_at=committed.registered_at)
    await ProviderEffectRecord.filter(id=cleaned.id).update(registered_at=committed.registered_at)
    await ProviderEffectRecord.filter(id=active.id).update(registered_at=committed.registered_at + timedelta(seconds=1))
    other = await _create_subject()
    other_effect, _ = await _effect_service(other).register_effect(
        lease=other.lease,
        registration=_registration(other, effect_key="other-job-effect"),
    )

    effects, _control = await service.list_effects(lease=subject.lease)

    terminal_ids = tuple(sorted((committed.id, cleaned.id), key=lambda value: value.int))
    expected_ids = (*terminal_ids, active.id)
    dispositions_by_id = {
        active.id: ProviderEffectDisposition.ACTIVE,
        committed.id: ProviderEffectDisposition.COMMITTED,
        cleaned.id: ProviderEffectDisposition.CLEANED,
    }
    assert tuple(effect.id for effect in effects) == expected_ids
    assert tuple(effect.disposition for effect in effects) == tuple(
        dispositions_by_id[effect_id] for effect_id in expected_ids
    )
    assert other_effect.id not in {effect.id for effect in effects}
    active_effects, _ = await service.list_active_effects(lease=subject.lease)
    assert tuple(effect.id for effect in active_effects) == (active.id,)

    await ProviderEffectRecord.filter(id=committed.id).update(
        settlement_reference={"marker_revision": "committed-v1", "unexpected": True}
    )
    with pytest.raises(JobExecutionStateInvariantError, match="settlement does not match"):
        await service.list_effects(lease=subject.lease)
    await ProviderEffectRecord.filter(id=committed.id).update(settlement_reference={"marker_revision": "committed-v1"})
    await ProviderEffectRecord.filter(id=cleaned.id).update(settlement_reference=None)
    with pytest.raises(JobExecutionStateInvariantError, match="settlement evidence"):
        await service.list_effects(lease=subject.lease)


@pytest.mark.parametrize("method_name", ["list_effects", "list_active_effects"])
async def test_effect_listing_surfaces_cancellation_for_reconciliation_and_renews(
    db_schema,
    method_name: str,
) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(
        lease=subject.lease,
        registration=_registration(subject),
    )
    await subject.attempt.refresh_from_db()
    heartbeat_before = subject.attempt.heartbeat_at
    lease_until_before = subject.attempt.lease_until
    async with in_transaction() as conn:
        cancelled_at = await BackgroundJobRepository().get_database_time(conn=conn)
    await BackgroundJobRecord.filter(id=subject.job.id).update(
        cancel_requested_at=cancelled_at,
        cancel_reason="stop before listing effects",
    )

    list_method = getattr(service, method_name)
    effects, control = await list_method(lease=subject.lease)

    await subject.attempt.refresh_from_db()
    assert tuple(item.id for item in effects) == (effect.id,)
    assert control.cancellation_requested is True
    assert subject.attempt.heartbeat_at == control.observed_at
    assert subject.attempt.lease_until == control.lease_until
    assert subject.attempt.heartbeat_at >= heartbeat_before
    assert subject.attempt.lease_until >= lease_until_before


async def test_effect_settlement_surfaces_cancellation_for_reconciliation_and_renews(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))
    await subject.attempt.refresh_from_db()
    heartbeat_before = subject.attempt.heartbeat_at
    lease_until_before = subject.attempt.lease_until
    async with in_transaction() as conn:
        cancelled_at = await BackgroundJobRepository().get_database_time(conn=conn)
    await BackgroundJobRecord.filter(id=subject.job.id).update(
        cancel_requested_at=cancelled_at,
        cancel_reason="reconcile the registered effect",
    )

    effects, control = await service.settle_effects(
        lease=subject.lease,
        settlement=ProviderEffectSettlement(
            effect_ids=(effect.id,),
            disposition=ProviderEffectDisposition.COMMITTED,
            settlement_reference={"marker_revision": "cancel-reconciliation-v1"},
        ),
    )

    await subject.attempt.refresh_from_db()
    assert tuple(item.id for item in effects) == (effect.id,)
    assert effects[0].disposition == ProviderEffectDisposition.COMMITTED
    assert control.cancellation_requested is True
    assert subject.attempt.heartbeat_at == control.observed_at
    assert subject.attempt.lease_until == control.lease_until
    assert subject.attempt.heartbeat_at >= heartbeat_before
    assert subject.attempt.lease_until >= lease_until_before


async def test_list_effects_rechecks_lease_after_waiting_for_effect_row_lock(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))
    async with in_transaction() as conn:
        observed_at = await BackgroundJobRepository().get_database_time(conn=conn)
        lease_expires_at = observed_at + timedelta(seconds=2)
        await (
            JobAttemptRecord
            .filter(id=subject.attempt.id)
            .using_db(conn)
            .update(
                lease_until=lease_expires_at,
            )
        )
    await subject.attempt.refresh_from_db()
    heartbeat_before = subject.attempt.heartbeat_at

    effect_locked = asyncio.Event()
    release_effect = asyncio.Event()
    blocker_pids: set[int] = set()

    async def hold_effect_row_lock() -> None:
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
            blocker_pids.add(int(rows[0]["pid"]))
            locked = await ProviderEffectRecord.filter(id=effect.id).using_db(conn).select_for_update().first()
            assert locked is not None
            effect_locked.set()
            await release_effect.wait()

    blocker_task = asyncio.create_task(hold_effect_row_lock())
    await asyncio.wait_for(effect_locked.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    effect_repository = ListingEffectLockProbeRepository()
    listing_task = asyncio.create_task(
        _effect_service(subject, effect_repository=effect_repository).list_effects(lease=subject.lease)
    )
    try:
        await asyncio.wait_for(effect_repository.requested.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        listing_pid = next(iter(effect_repository.backend_pids))
        await _wait_for_postgres_lock_wait(backend_pid=listing_pid)
        assert blocker_pids.isdisjoint(effect_repository.backend_pids)
        await _wait_until_database_time_reaches(target=lease_expires_at)
    finally:
        release_effect.set()
        await blocker_task

    with pytest.raises(JobExecutionLeaseLostError):
        await listing_task
    await subject.attempt.refresh_from_db()
    assert subject.attempt.heartbeat_at == heartbeat_before
    assert subject.attempt.lease_until == lease_expires_at


async def test_exact_storage_profile_binding_resolution_allows_history_and_rejects_any_mismatch(
    db_schema,
) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    async with in_transaction() as conn:
        tombstoned_at = await StorageProfileRouteRepository().get_database_time(conn=conn)
    await StorageProfile.filter(id=subject.profile.id).update(
        is_active=False,
        tombstoned_at=tombstoned_at,
        secret_ref={"secret_access_key": "rotated-secret"},
    )

    resolved = await service.resolve_storage_profile_binding(binding=subject.binding)

    assert resolved.binding == subject.binding
    assert resolved.is_tombstoned is True
    assert resolved.config.secret_access_key is not None
    assert resolved.config.secret_access_key.get_secret_value() == "rotated-secret"

    mismatched_bindings = (
        subject.binding.model_copy(update={"route_hash": "0" * 64}),
        subject.binding.model_copy(
            update={
                "route": subject.binding.route.model_copy(update={"bucket": "caller-substituted-bucket"}),
            }
        ),
    )
    for mismatched_binding in mismatched_bindings:
        with pytest.raises(JobExecutionStateInvariantError, match="exact Storage Profile binding"):
            await service.resolve_storage_profile_binding(binding=mismatched_binding)


async def test_exact_storage_profile_binding_resolution_never_falls_back_to_another_revision(
    db_schema,
) -> None:
    _ = db_schema
    subject = await _create_subject()
    other = await _create_subject()
    service = _effect_service(subject)
    cross_profile_revision = subject.binding.model_copy(
        update={"profile_revision_id": other.binding.profile_revision_id}
    )
    missing_profile = subject.binding.model_copy(update={"profile_id": uuid4()})

    with pytest.raises(StorageProfileRouteInvariantError, match="revision .* no longer exists"):
        await service.resolve_storage_profile_binding(binding=cross_profile_revision)
    with pytest.raises(StorageProfileRouteInvariantError, match="profile .* no longer exists"):
        await service.resolve_storage_profile_binding(binding=missing_profile)


async def test_exact_storage_profile_binding_resolution_rejects_persisted_revision_corruption(
    db_schema,
) -> None:
    _ = db_schema
    subject = await _create_subject()
    await StorageProfileRouteRevision.filter(id=subject.binding.profile_revision_id).update(route_hash="0" * 64)

    with pytest.raises(StorageProfileRouteInvariantError, match="hash does not match"):
        await _effect_service(subject).resolve_storage_profile_binding(binding=subject.binding)


async def test_exact_storage_profile_binding_resolution_waits_for_profile_lock_and_reloads_credentials(
    db_schema,
) -> None:
    _ = db_schema
    subject = await _create_subject()
    rotation_locked = asyncio.Event()
    release_rotation = asyncio.Event()
    rotation_pids: set[int] = set()

    async def rotate_credentials() -> None:
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
            rotation_pids.add(int(rows[0]["pid"]))
            profile = await StorageProfile.filter(id=subject.profile.id).using_db(conn).select_for_update().first()
            assert profile is not None
            profile.secret_ref = {"secret_access_key": "lock-rotated-secret"}
            await profile.save(update_fields=["secret_ref", "updated_at"], using_db=conn)
            rotation_locked.set()
            await release_rotation.wait()

    rotation_task = asyncio.create_task(rotate_credentials())
    await asyncio.wait_for(rotation_locked.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    route_repository = ProfileLockProbeRepository(hold_after_acquire=False)
    resolution_task = asyncio.create_task(
        _effect_service(subject, route_repository=route_repository).resolve_storage_profile_binding(
            binding=subject.binding
        )
    )
    try:
        await asyncio.wait_for(route_repository.requested.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        resolution_pid = next(iter(route_repository.backend_pids))
        await _wait_for_postgres_lock_wait(backend_pid=resolution_pid)
        assert route_repository.acquired.is_set() is False
        assert rotation_pids.isdisjoint(route_repository.backend_pids)
    finally:
        release_rotation.set()
        await rotation_task

    resolved = await resolution_task
    assert route_repository.acquired.is_set() is True
    assert resolved.binding == subject.binding
    assert resolved.config.secret_access_key is not None
    assert resolved.config.secret_access_key.get_secret_value() == "lock-rotated-secret"


async def test_persisted_contract_drift_fails_closed_on_read_replay_and_resolve(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))
    await ProviderEffectRecord.filter(id=effect.id).update(schema_version=2)

    with pytest.raises(JobExecutionStateInvariantError, match="Unknown provider effect contract"):
        await service.list_active_effects(lease=subject.lease)
    with pytest.raises(JobExecutionStateInvariantError, match="Unknown provider effect contract"):
        await service.register_effect(lease=subject.lease, registration=_registration(subject))
    with pytest.raises(JobExecutionStateInvariantError, match="Unknown provider effect contract"):
        await service.resolve_effect_route(effect_id=effect.id)


async def test_persisted_effect_relations_fail_closed_across_core_seams(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    other = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))
    cleanup = ProviderEffectSettlement(
        effect_ids=(effect.id,),
        disposition=ProviderEffectDisposition.CLEANED,
        settlement_reference={"cleanup_run_id": "cleanup-relations"},
    )

    await ProviderEffectRecord.filter(id=effect.id).update(job_id=other.job.id)
    with pytest.raises(JobExecutionStateInvariantError, match="registered Job"):
        await service.register_effect(lease=subject.lease, registration=_registration(subject))
    await ProviderEffectRecord.filter(id=effect.id).update(job_id=subject.job.id)

    await ProviderEffectRecord.filter(id=effect.id).update(owner_attempt_id=other.attempt.id)
    with pytest.raises(JobExecutionStateInvariantError, match="owner Attempt"):
        await service.list_active_effects(lease=subject.lease)
    with pytest.raises(JobExecutionStateInvariantError, match="owner Attempt"):
        await service.settle_effects(lease=subject.lease, settlement=cleanup)
    with pytest.raises(JobExecutionStateInvariantError, match="owner Attempt"):
        await service.resolve_effect_route(effect_id=effect.id)
    await ProviderEffectRecord.filter(id=effect.id).update(owner_attempt_id=subject.attempt.id)

    await ProviderEffectRecord.filter(id=effect.id).update(
        profile_revision_id=other.binding.profile_revision_id,
    )
    with pytest.raises(JobExecutionStateInvariantError, match="Route Revision"):
        await service.list_active_effects(lease=subject.lease)
    with pytest.raises(JobExecutionStateInvariantError, match="Route Revision"):
        await service.settle_effects(lease=subject.lease, settlement=cleanup)
    with pytest.raises(JobExecutionStateInvariantError, match="Route Revision"):
        await service.resolve_effect_route(effect_id=effect.id)
    with pytest.raises(JobExecutionStateInvariantError, match="Route Revision"):
        await service.register_effect(lease=subject.lease, registration=_registration(subject))
    await ProviderEffectRecord.filter(id=effect.id).update(
        profile_revision_id=subject.binding.profile_revision_id,
    )

    await StorageProfileRouteRevision.filter(id=subject.binding.profile_revision_id).update(route_hash="0" * 64)
    with pytest.raises(StorageProfileRouteInvariantError, match="hash does not match"):
        await service.list_active_effects(lease=subject.lease)
    with pytest.raises(StorageProfileRouteInvariantError, match="hash does not match"):
        await service.settle_effects(lease=subject.lease, settlement=cleanup)
    with pytest.raises(StorageProfileRouteInvariantError, match="hash does not match"):
        await service.resolve_effect_route(effect_id=effect.id)
    with pytest.raises(StorageProfileRouteInvariantError, match="hash does not match"):
        await service.register_effect(lease=subject.lease, registration=_registration(subject))


async def test_persisted_settling_attempt_must_belong_to_effect_job(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    other = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))
    settlement = ProviderEffectSettlement(
        effect_ids=(effect.id,),
        disposition=ProviderEffectDisposition.COMMITTED,
        settlement_reference={"marker_revision": "asset-v1"},
    )
    await service.settle_effects(lease=subject.lease, settlement=settlement)
    await ProviderEffectRecord.filter(id=effect.id).update(settled_by_attempt_id=other.attempt.id)

    with pytest.raises(JobExecutionStateInvariantError, match="settling Attempt"):
        await service.settle_effects(lease=subject.lease, settlement=settlement)
    with pytest.raises(JobExecutionStateInvariantError, match="settling Attempt"):
        await service.resolve_effect_route(effect_id=effect.id)
    with pytest.raises(JobExecutionStateInvariantError, match="settling Attempt"):
        await service.register_effect(lease=subject.lease, registration=_registration(subject))


async def test_effect_route_resolution_rejects_identity_drift_while_waiting_for_profile_lock(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    other = await _create_subject()
    effect, _ = await _effect_service(subject).register_effect(
        lease=subject.lease,
        registration=_registration(subject),
    )
    route_repository = ProfileLockProbeRepository(hold_after_acquire=False)
    effect_repository = ResolutionEffectProbeRepository()
    resolve_task = asyncio.create_task(
        _effect_service(
            subject,
            route_repository=route_repository,
            effect_repository=effect_repository,
        ).resolve_effect_route(effect_id=effect.id)
    )

    try:
        async with in_transaction() as conn:
            locked_profile = await (
                StorageProfile.filter(id=subject.profile.id).using_db(conn).select_for_update().first()
            )
            assert locked_profile is not None
            await asyncio.wait_for(route_repository.requested.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
            resolver_pid = next(iter(route_repository.backend_pids))
            await _wait_for_postgres_lock_wait(backend_pid=resolver_pid)
            await ProviderEffectRecord.filter(id=effect.id).update(profile_id=other.profile.id)

        with pytest.raises(JobExecutionStateInvariantError, match="changed during route resolution"):
            await resolve_task
        assert route_repository.backend_pids == effect_repository.backend_pids
        assert len(effect_repository.backend_pids) == 1
    finally:
        if not resolve_task.done():
            resolve_task.cancel()
            await asyncio.gather(resolve_task, return_exceptions=True)


@pytest.mark.parametrize("terminal_status", [JobInternalStatus.FAILED, JobInternalStatus.DEAD_LETTERED])
async def test_terminal_job_status_does_not_settle_active_effect(db_schema, terminal_status: JobInternalStatus) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))

    await BackgroundJobRecord.filter(id=subject.job.id).update(internal_status=terminal_status)
    persisted = await ProviderEffectRecord.get(id=effect.id)

    assert persisted.disposition == ProviderEffectDisposition.ACTIVE
    async with in_transaction() as conn:
        assert await ProviderEffectRepository().has_active_effects_for_profile(
            profile_id=subject.profile.id,
            conn=conn,
        )


async def test_settlement_cas_exact_replay_and_terminal_swap_conflict(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    effect_repository = CountingEffectRepository()
    service = _effect_service(subject, effect_repository=effect_repository)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))
    settlement = ProviderEffectSettlement(
        effect_ids=(effect.id,),
        disposition=ProviderEffectDisposition.COMMITTED,
        settlement_reference={"marker_revision": "asset-row-v1"},
    )

    first, second = await asyncio.gather(
        service.settle_effects(lease=subject.lease, settlement=settlement),
        service.settle_effects(lease=subject.lease, settlement=settlement),
    )

    assert first[0] == second[0]
    assert effect_repository.active_cas_count == 1
    with pytest.raises(JobExecutionStateInvariantError, match="cannot change its terminal settlement"):
        await service.settle_effects(
            lease=subject.lease,
            settlement=ProviderEffectSettlement(
                effect_ids=(effect.id,),
                disposition=ProviderEffectDisposition.CLEANED,
                settlement_reference={"cleanup_run_id": "cleanup-1"},
            ),
        )


async def test_concurrent_committed_and_cleaned_settlements_have_one_winner(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))

    outcomes = await asyncio.gather(
        service.settle_effects(
            lease=subject.lease,
            settlement=ProviderEffectSettlement(
                effect_ids=(effect.id,),
                disposition=ProviderEffectDisposition.COMMITTED,
                settlement_reference={"marker_revision": "asset-v1"},
            ),
        ),
        service.settle_effects(
            lease=subject.lease,
            settlement=ProviderEffectSettlement(
                effect_ids=(effect.id,),
                disposition=ProviderEffectDisposition.CLEANED,
                settlement_reference={"cleanup_run_id": "cleanup-v1"},
            ),
        ),
        return_exceptions=True,
    )

    assert sum(isinstance(outcome, JobExecutionStateInvariantError) for outcome in outcomes) == 1
    assert sum(not isinstance(outcome, BaseException) for outcome in outcomes) == 1
    persisted = await ProviderEffectRecord.get(id=effect.id)
    assert persisted.disposition in {
        ProviderEffectDisposition.COMMITTED,
        ProviderEffectDisposition.CLEANED,
    }


async def test_inactive_profile_rejects_new_effect(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    await StorageProfile.filter(id=subject.profile.id).update(is_active=False)

    with pytest.raises(ProviderEffectRegistrationProfileUnavailableError) as unavailable:
        await _effect_service(subject).register_effect(
            lease=subject.lease,
            registration=_registration(subject),
        )
    assert isinstance(unavailable.value, ProviderEffectRegistrationError)
    assert not isinstance(unavailable.value, JobExecutionStateInvariantError)
    assert unavailable.value.profile_id == subject.profile.id
    with pytest.raises(AttributeError):
        setattr(unavailable.value, "profile_id", uuid4())  # noqa: B010 - verifies the public field is read-only
    assert await ProviderEffectRecord.filter(job_id=subject.job.id).count() == 0


async def test_missing_profile_rejects_new_effect_with_typed_unavailable_error(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    missing_profile_id = uuid4()
    missing_profile_registration = _registration(subject).model_copy(
        update={
            "route": subject.binding.model_copy(update={"profile_id": missing_profile_id}),
        }
    )

    with pytest.raises(ProviderEffectRegistrationProfileUnavailableError) as unavailable:
        await _effect_service(subject).register_effect(
            lease=subject.lease,
            registration=missing_profile_registration,
        )
    assert isinstance(unavailable.value, ProviderEffectRegistrationError)
    assert not isinstance(unavailable.value, JobExecutionStateInvariantError)
    assert unavailable.value.profile_id == missing_profile_id
    assert await ProviderEffectRecord.filter(job_id=subject.job.id).count() == 0


async def test_missing_cross_profile_binding_is_replay_conflict_not_profile_unavailability(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))
    conflicting_registration = _registration(subject).model_copy(
        update={
            "route": subject.binding.model_copy(update={"profile_id": uuid4()}),
        }
    )

    with pytest.raises(JobExecutionStateInvariantError, match="cannot replace existing evidence") as conflict:
        await service.register_effect(lease=subject.lease, registration=conflicting_registration)
    assert not isinstance(conflict.value, ProviderEffectRegistrationError)
    assert await ProviderEffectRecord.filter(job_id=subject.job.id).count() == 1
    assert await ProviderEffectRecord.filter(id=effect.id).exists()


async def test_explicit_null_route_locator_is_distinct_from_omission_and_respects_active_effects(db_schema) -> None:
    _ = db_schema
    clearable = await _create_subject()
    admin = StorageProfilesService(clearable.settings)

    await admin.update_profile(
        profile_id=clearable.profile.id,
        payload=StorageProfileUpdateRequest(display_name="Omitted endpoint remains"),
    )
    await clearable.profile.refresh_from_db()
    assert clearable.profile.config["endpoint_url"] == "https://storage.example.com"
    assert await StorageProfileRouteRevision.filter(profile_id=clearable.profile.id).count() == 1

    updated = await admin.update_profile(
        profile_id=clearable.profile.id,
        payload=StorageProfileUpdateRequest(config=StorageProfileConfigPayload(endpoint_url=None)),
    )
    await clearable.profile.refresh_from_db()
    assert clearable.profile.config["endpoint_url"] is None
    assert updated.config.endpoint_url is None
    assert await StorageProfileRouteRevision.filter(profile_id=clearable.profile.id).count() == 2

    protected = await _create_subject()
    await _effect_service(protected).register_effect(
        lease=protected.lease,
        registration=_registration(protected),
    )
    with pytest.raises(BadRequest) as blocked:
        await StorageProfilesService(protected.settings).update_profile(
            profile_id=protected.profile.id,
            payload=StorageProfileUpdateRequest(config=StorageProfileConfigPayload(endpoint_url=None)),
        )
    assert blocked.value.error == "STORAGE_PROFILE_IN_USE"
    await protected.profile.refresh_from_db()
    assert protected.profile.config["endpoint_url"] == "https://storage.example.com"
    assert await StorageProfileRouteRevision.filter(profile_id=protected.profile.id).count() == 1


async def test_replacement_generation_fence_rejects_before_profile_lock(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    winner_locked = asyncio.Event()
    release_winner = asyncio.Event()
    winner_pids: set[int] = set()

    async def replace_generation() -> None:
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
            winner_pids.add(int(rows[0]["pid"]))
            job = await BackgroundJobRecord.filter(id=subject.job.id).using_db(conn).select_for_update().first()
            attempt = await JobAttemptRecord.filter(id=subject.attempt.id).using_db(conn).select_for_update().first()
            assert job is not None
            assert attempt is not None
            winner_locked.set()
            await release_winner.wait()
            now = await BackgroundJobRepository().get_database_time(conn=conn)
            attempt.status = JobAttemptStatus.LEASE_EXPIRED
            attempt.completed_at = now
            await attempt.save(update_fields=["status", "completed_at", "updated_at"], using_db=conn)
            job.internal_status = JobInternalStatus.RETRY_SCHEDULED
            job.next_attempt_at = now
            await job.save(update_fields=["internal_status", "next_attempt_at", "updated_at"], using_db=conn)

    winner_task = asyncio.create_task(replace_generation())
    await asyncio.wait_for(winner_locked.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    job_repository = JobLockProbeRepository()
    route_repository = ProfileLockProbeRepository(hold_after_acquire=False)
    register_task = asyncio.create_task(
        _effect_service(
            subject,
            job_repository=job_repository,
            route_repository=route_repository,
        ).register_effect(
            lease=subject.lease,
            registration=_registration(subject),
        )
    )
    await asyncio.wait_for(job_repository.requested.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    waiting_pid = next(iter(job_repository.backend_pids))
    await _wait_for_postgres_lock_wait(backend_pid=waiting_pid)
    assert route_repository.requested.is_set() is False
    assert winner_pids.isdisjoint(job_repository.backend_pids)

    release_winner.set()
    await winner_task
    with pytest.raises(JobExecutionLeaseLostError):
        await register_task
    assert route_repository.requested.is_set() is False
    assert await ProviderEffectRecord.filter(job_id=subject.job.id).count() == 0


async def test_registration_first_allows_tombstone_and_exact_replay(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    registration_repository = ProfileLockProbeRepository(hold_after_acquire=True)
    registration_service = _effect_service(
        subject,
        route_repository=registration_repository,
    )
    registration = _registration(subject)
    register_task = asyncio.create_task(
        registration_service.register_effect(lease=subject.lease, registration=registration)
    )
    await asyncio.wait_for(registration_repository.acquired.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)

    delete_repository = ProfileLockProbeRepository(hold_after_acquire=False)
    delete_task = asyncio.create_task(
        StorageProfilesService(subject.settings, route_repository=delete_repository).delete_profile(
            profile_id=subject.profile.id,
        )
    )
    await asyncio.wait_for(delete_repository.requested.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    delete_pid = next(iter(delete_repository.backend_pids))
    await _wait_for_postgres_lock_wait(backend_pid=delete_pid)
    assert registration_repository.backend_pids.isdisjoint(delete_repository.backend_pids)

    registration_repository.release.set()
    (effect, _control), deleted = await asyncio.gather(register_task, delete_task)
    assert deleted.deleted is True
    await subject.profile.refresh_from_db()
    assert subject.profile.tombstoned_at is not None
    assert (await ProviderEffectRecord.get(id=effect.id)).disposition == ProviderEffectDisposition.ACTIVE

    replay, _ = await registration_service.register_effect(
        lease=subject.lease,
        registration=registration,
    )
    assert replay.id == effect.id
    with pytest.raises(ProviderEffectRegistrationProfileUnavailableError) as unavailable:
        await registration_service.register_effect(
            lease=subject.lease,
            registration=_registration(subject, effect_key="new-effect"),
        )
    assert isinstance(unavailable.value, ProviderEffectRegistrationError)
    assert not isinstance(unavailable.value, JobExecutionStateInvariantError)
    assert unavailable.value.profile_id == subject.profile.id
    resolved = await registration_service.resolve_effect_route(effect_id=effect.id)
    assert resolved.is_tombstoned is True
    assert resolved.binding == subject.binding


async def test_tombstone_first_rejects_registration_before_effect_insert(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    tombstone_locked = asyncio.Event()
    release_tombstone = asyncio.Event()
    tombstone_pids: set[int] = set()

    async def tombstone() -> None:
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
            tombstone_pids.add(int(rows[0]["pid"]))
            profile = await StorageProfile.filter(id=subject.profile.id).using_db(conn).select_for_update().first()
            assert profile is not None
            profile.tombstoned_at = await StorageProfileRouteRepository().get_database_time(conn=conn)
            profile.is_active = False
            await profile.save(update_fields=["tombstoned_at", "is_active", "updated_at"], using_db=conn)
            tombstone_locked.set()
            await release_tombstone.wait()

    tombstone_task = asyncio.create_task(tombstone())
    await asyncio.wait_for(tombstone_locked.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    registration_repository = ProfileLockProbeRepository(hold_after_acquire=False)
    registration_task = asyncio.create_task(
        _effect_service(subject, route_repository=registration_repository).register_effect(
            lease=subject.lease,
            registration=_registration(subject),
        )
    )
    await asyncio.wait_for(registration_repository.requested.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    registration_pid = next(iter(registration_repository.backend_pids))
    await _wait_for_postgres_lock_wait(backend_pid=registration_pid)
    assert tombstone_pids.isdisjoint(registration_repository.backend_pids)
    assert await ProviderEffectRecord.filter(job_id=subject.job.id).count() == 0

    release_tombstone.set()
    await tombstone_task
    with pytest.raises(ProviderEffectRegistrationProfileUnavailableError) as unavailable:
        await registration_task
    assert isinstance(unavailable.value, ProviderEffectRegistrationError)
    assert not isinstance(unavailable.value, JobExecutionStateInvariantError)
    assert unavailable.value.profile_id == subject.profile.id
    assert await ProviderEffectRecord.filter(job_id=subject.job.id).count() == 0


async def test_update_first_rejects_stale_pre_resolved_registration(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    update_repository = RevisionInsertProbeRepository()
    update_task = asyncio.create_task(
        StorageProfilesService(subject.settings, route_repository=update_repository).update_profile(
            profile_id=subject.profile.id,
            payload=StorageProfileUpdateRequest(
                config=StorageProfileConfigPayload(bucket=f"migrated-{uuid4().hex}"),
            ),
        )
    )
    await asyncio.wait_for(update_repository.revision_inserted.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    registration_repository = ProfileLockProbeRepository(hold_after_acquire=False)
    register_task = asyncio.create_task(
        _effect_service(subject, route_repository=registration_repository).register_effect(
            lease=subject.lease,
            registration=_registration(subject),
        )
    )
    await asyncio.wait_for(registration_repository.requested.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    registration_pid = next(iter(registration_repository.backend_pids))
    await _wait_for_postgres_lock_wait(backend_pid=registration_pid)

    update_repository.release.set()
    await update_task
    with pytest.raises(ProviderEffectRegistrationRouteStaleError) as stale:
        await register_task
    latest_revision = (
        await StorageProfileRouteRevision.filter(profile_id=subject.profile.id).order_by("-revision_number").first()
    )
    assert latest_revision is not None
    assert isinstance(stale.value, ProviderEffectRegistrationError)
    assert not isinstance(stale.value, JobExecutionStateInvariantError)
    assert stale.value.profile_id == subject.profile.id
    assert stale.value.expected_route_hash == subject.binding.route_hash
    assert stale.value.observed_route_hash == latest_revision.route_hash
    with pytest.raises(AttributeError):
        setattr(stale.value, "observed_route_hash", "0" * 64)  # noqa: B010 - verifies read-only metadata
    error_payload = f"{stale.value} {stale.value.args!r}"
    assert "current-secret" not in error_payload
    assert "current-access-key" not in error_payload
    assert "storage.example.com" not in error_payload
    assert await ProviderEffectRecord.filter(job_id=subject.job.id).count() == 0


async def test_registration_first_keeps_old_revision_while_route_update_appends(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    registration_repository = ProfileLockProbeRepository(hold_after_acquire=True)
    register_task = asyncio.create_task(
        _effect_service(subject, route_repository=registration_repository).register_effect(
            lease=subject.lease,
            registration=_registration(subject),
        )
    )
    await asyncio.wait_for(registration_repository.acquired.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    next_bucket = f"migrated-{uuid4().hex}"
    update_repository = ProfileLockProbeRepository(hold_after_acquire=False)
    update_task = asyncio.create_task(
        StorageProfilesService(subject.settings, route_repository=update_repository).update_profile(
            profile_id=subject.profile.id,
            payload=StorageProfileUpdateRequest(config=StorageProfileConfigPayload(bucket=next_bucket)),
        )
    )
    await asyncio.wait_for(update_repository.requested.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    update_pid = next(iter(update_repository.backend_pids))
    await _wait_for_postgres_lock_wait(backend_pid=update_pid)
    assert registration_repository.backend_pids.isdisjoint(update_repository.backend_pids)
    registration_repository.release.set()
    (effect, _control), _updated = await asyncio.gather(register_task, update_task)

    await subject.profile.refresh_from_db()
    assert effect.profile_revision_id == subject.binding.profile_revision_id
    assert subject.profile.config["bucket"] == next_bucket
    assert await StorageProfileRouteRevision.filter(profile_id=subject.profile.id).count() == 2


async def _mark_source_job_recoverable(subject: EffectSubject) -> None:
    repository = BackgroundJobRepository()
    async with in_transaction() as conn:
        now = await repository.get_database_time(conn=conn)
        await (
            JobAttemptRecord
            .filter(id=subject.attempt.id)
            .using_db(conn)
            .update(
                status=JobAttemptStatus.LEASE_EXPIRED,
                completed_at=now,
                error_code="BACKGROUND_JOB_WORKER_LOST",
                updated_at=now,
            )
        )
        await (
            BackgroundJobRecord
            .filter(id=subject.job.id)
            .using_db(conn)
            .update(
                internal_status=JobInternalStatus.DEAD_LETTERED,
                completed_at=now,
                error_code="BACKGROUND_JOB_WORKER_LOST",
                updated_at=now,
            )
        )


async def _create_recovery_execution(
    subject: EffectSubject,
    *,
    source_job_id: UUID | None = None,
    effect_type: str = "asset.thumbnail.objects",
    job_type: str = PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
) -> tuple[BackgroundJobRecord, JobAttemptRecord, JobExecutionLease]:
    target = ProviderEffectRecoveryTarget(
        source_job_id=source_job_id or subject.job.id,
        effect_type=effect_type,
        schema_version=1,
    )
    return await _create_execution_subject(
        job_type=job_type,
        job_type_version=PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
        task_name=PROVIDER_EFFECT_RECOVERY_TASK_NAME,
        target_descriptor=target.model_dump(mode="json", by_alias=True),
    )


async def test_terminal_source_effect_settles_under_exact_recovery_attempt(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    workspace_id = uuid4()
    project_id = uuid4()
    await BackgroundJobRecord.filter(id=subject.job.id).update(
        workspace_id=workspace_id,
        project_id=project_id,
    )
    await subject.job.refresh_from_db()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))
    await _mark_source_job_recoverable(subject)
    recovery_job, recovery_attempt, recovery_lease = await _create_recovery_execution(subject)

    listed, _ = await service.list_effects_for_recovery(
        lease=recovery_lease,
        source_job_id=subject.job.id,
        effect_type="asset.thumbnail.objects",
        schema_version=1,
    )
    settled, _ = await service.settle_effects_for_recovery(
        lease=recovery_lease,
        source_job_id=subject.job.id,
        effect_type="asset.thumbnail.objects",
        schema_version=1,
        settlement=ProviderEffectSettlement(
            effect_ids=(effect.id,),
            disposition=ProviderEffectDisposition.CLEANED,
            settlement_reference={"cleanup_run_id": "maintenance-v1"},
        ),
    )

    assert listed.source_job_id == subject.job.id
    assert listed.workspace_id == workspace_id
    assert listed.project_id == project_id
    assert listed.site_id is None
    assert tuple(item.id for item in listed.effects) == (effect.id,)
    assert settled[0].disposition == ProviderEffectDisposition.CLEANED
    assert settled[0].settled_by_attempt_id == recovery_attempt.id
    persisted = await ProviderEffectRecord.get(id=effect.id)
    assert persisted.job_id == subject.job.id
    assert persisted.settled_by_attempt_id == recovery_attempt.id
    assert recovery_job.id != subject.job.id

    replay, _ = await service.settle_effects_for_recovery(
        lease=recovery_lease,
        source_job_id=subject.job.id,
        effect_type="asset.thumbnail.objects",
        schema_version=1,
        settlement=ProviderEffectSettlement(
            effect_ids=(effect.id,),
            disposition=ProviderEffectDisposition.CLEANED,
            settlement_reference={"cleanup_run_id": "maintenance-v1"},
        ),
    )
    assert replay == settled
    assert (await service.resolve_effect_route(effect_id=effect.id)).binding == subject.binding


async def test_recovery_authority_rejects_live_source_and_cross_contract_without_mutation(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    service = _effect_service(subject)
    effect, _ = await service.register_effect(lease=subject.lease, registration=_registration(subject))
    _job, _attempt, recovery_lease = await _create_recovery_execution(subject)

    with pytest.raises(JobExecutionStateInvariantError, match="not terminal and recoverable"):
        await service.list_effects_for_recovery(
            lease=recovery_lease,
            source_job_id=subject.job.id,
            effect_type="asset.thumbnail.objects",
            schema_version=1,
        )

    await _mark_source_job_recoverable(subject)
    _other_job, _other_attempt, unrelated_lease = await _create_recovery_execution(
        subject,
        job_type="test.unrelated-maintenance",
    )
    with pytest.raises(JobExecutionStateInvariantError, match="not a Provider Effect recovery authority"):
        await service.list_effects_for_recovery(
            lease=unrelated_lease,
            source_job_id=subject.job.id,
            effect_type="asset.thumbnail.objects",
            schema_version=1,
        )

    with pytest.raises(JobExecutionStateInvariantError, match="does not authorize the requested source contract"):
        await service.settle_effects_for_recovery(
            lease=recovery_lease,
            source_job_id=subject.job.id,
            effect_type="asset.video.objects",
            schema_version=1,
            settlement=ProviderEffectSettlement(
                effect_ids=(effect.id,),
                disposition=ProviderEffectDisposition.CLEANED,
                settlement_reference={"cleanup_run_id": "must-not-settle"},
            ),
        )
    assert (await ProviderEffectRecord.get(id=effect.id)).disposition == ProviderEffectDisposition.ACTIVE


async def test_bounded_recovery_scan_fans_out_one_idempotent_maintenance_job(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    effect, _ = await _effect_service(subject).register_effect(
        lease=subject.lease,
        registration=_registration(subject),
    )
    await _mark_source_job_recoverable(subject)
    scanner = ProviderEffectRecoveryEnqueueService(
        subject.settings,
        contracts=(("asset.thumbnail.objects", 1),),
    )

    first = await scanner.enqueue_due(limit=10)
    replay = await scanner.enqueue_due(limit=10)

    assert first.scanned_count == 1
    assert len(first.created_job_ids) == 1
    assert first.replayed_job_ids == ()
    assert replay.scanned_count == 1
    assert replay.created_job_ids == ()
    assert replay.replayed_job_ids == first.created_job_ids
    recovery_job = await BackgroundJobRecord.get(id=first.created_job_ids[0])
    target = ProviderEffectRecoveryTarget.model_validate(recovery_job.target_descriptor)
    assert target.source_job_id == subject.job.id
    assert target.effect_type == "asset.thumbnail.objects"
    assert target.schema_version == 1
    assert recovery_job.job_type == PROVIDER_EFFECT_RECOVERY_JOB_TYPE
    assert recovery_job.task_name == PROVIDER_EFFECT_RECOVERY_TASK_NAME
    assert recovery_job.workload_class == JobWorkloadClass.MAINTENANCE
    assert recovery_job.internal_status == JobInternalStatus.PENDING_DISPATCH
    assert await JobDispatchOutboxRecord.filter(job_id=recovery_job.id).count() == 1
    assert await BackgroundJobRecord.filter(job_type=PROVIDER_EFFECT_RECOVERY_JOB_TYPE).count() == 1
    assert (await ProviderEffectRecord.get(id=effect.id)).disposition == ProviderEffectDisposition.ACTIVE


class _CoordinatedRecoveryRepository(ProviderEffectRecoveryRepository):
    def __init__(self) -> None:
        super().__init__()
        self.first_selected = asyncio.Event()
        self.release_first = asyncio.Event()

    async def list_candidates_for_update(
        self,
        *,
        effect_type: str,
        schema_version: int,
        limit: int,
        conn: BaseDBAsyncClient,
    ):  # type: ignore[no-untyped-def]
        selected = await super().list_candidates_for_update(
            effect_type=effect_type,
            schema_version=schema_version,
            limit=limit,
            conn=conn,
        )
        if selected and not self.first_selected.is_set():
            self.first_selected.set()
            await self.release_first.wait()
        return selected


async def test_concurrent_recovery_scanners_skip_locked_source_and_create_one_job(db_schema) -> None:
    _ = db_schema
    subject = await _create_subject()
    effect, _ = await _effect_service(subject).register_effect(
        lease=subject.lease,
        registration=_registration(subject),
    )
    await _mark_source_job_recoverable(subject)
    repository = _CoordinatedRecoveryRepository()
    first_scanner = ProviderEffectRecoveryEnqueueService(
        subject.settings,
        contracts=((effect.effect_type, effect.schema_version),),
        repository=repository,
    )
    second_scanner = ProviderEffectRecoveryEnqueueService(
        subject.settings,
        contracts=((effect.effect_type, effect.schema_version),),
        repository=repository,
    )

    first_task = asyncio.create_task(first_scanner.enqueue_due(limit=10))
    await asyncio.wait_for(
        repository.first_selected.wait(),
        timeout=LOCK_PROBE_TIMEOUT_SECONDS,
    )
    try:
        second = await asyncio.wait_for(
            second_scanner.enqueue_due(limit=10),
            timeout=LOCK_PROBE_TIMEOUT_SECONDS,
        )
    finally:
        repository.release_first.set()
    first = await asyncio.wait_for(first_task, timeout=LOCK_PROBE_TIMEOUT_SECONDS)

    assert first.scanned_count == 1
    assert len(first.created_job_ids) == 1
    assert second.scanned_count == 0
    assert second.created_job_ids == ()
    assert second.replayed_job_ids == ()
    assert await BackgroundJobRecord.filter(job_type=PROVIDER_EFFECT_RECOVERY_JOB_TYPE).count() == 1
    assert await JobDispatchOutboxRecord.filter(job_id=first.created_job_ids[0]).count() == 1
    assert (await ProviderEffectRecord.get(id=effect.id)).disposition == ProviderEffectDisposition.ACTIVE
