from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.services import BaseService
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobAuthorityMode,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.models.storage.storage_profile import StorageProfile, StorageProfileRouteRevision
from src.modules.jobs.execution_errors import (
    JobExecutionCancellationRequestedError,
    JobExecutionStateInvariantError,
)
from src.modules.jobs.execution_repository import JobExecutionRepository
from src.modules.jobs.execution_schema import JobExecutionControlSnapshot, JobExecutionLease
from src.modules.jobs.execution_validation import build_execution_control_snapshot
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_contracts import ProviderEffectContractRegistry
from src.modules.jobs.provider_effect_errors import (
    ProviderEffectRegistrationProfileUnavailableError,
    ProviderEffectRegistrationRouteStaleError,
)
from src.modules.jobs.provider_effect_recovery import (
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
    PROVIDER_EFFECT_RECOVERY_TASK_NAME,
    ProviderEffectRecoveryTarget,
)
from src.modules.jobs.provider_effect_repository import ProviderEffectRepository
from src.modules.jobs.provider_effect_schema import (
    ProviderEffectRecoverySnapshot,
    ProviderEffectRegistration,
    ProviderEffectSettlement,
    ProviderEffectSnapshot,
)
from src.modules.jobs.repository import BackgroundJobRepository
from src.platform.storage.profile_route_repository import StorageProfileRouteRepository
from src.platform.storage.profile_route_service import (
    ResolvedStorageProfileRoute,
    StorageProfileRouteService,
)
from src.platform.storage.profile_routes import StorageProfileRouteBinding

_RECOVERY_SOURCE_TERMINAL_STATUSES = frozenset({
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
})


class ProviderEffectService(BaseService):
    """Fenced registration, listing, settlement, and route resolution for provider effects."""

    def __init__(
        self,
        settings: Settings,
        *,
        job_repository: JobExecutionRepository | None = None,
        effect_repository: ProviderEffectRepository | None = None,
        route_repository: StorageProfileRouteRepository | None = None,
        contracts: ProviderEffectContractRegistry | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="provider-effects")
        self.job_repository = job_repository or BackgroundJobRepository()
        self.effect_repository = effect_repository or ProviderEffectRepository()
        self.route_repository = route_repository or StorageProfileRouteRepository()
        self.contracts = contracts or ProviderEffectContractRegistry()
        self.route_service = StorageProfileRouteService(settings, repository=self.route_repository)

    async def materialize_storage_profile_route(
        self,
        *,
        profile_key: str,
    ) -> StorageProfileRouteBinding:
        return await self.route_service.materialize_by_key(profile_key=profile_key)

    async def resolve_storage_profile_binding(
        self,
        *,
        binding: StorageProfileRouteBinding,
    ) -> ResolvedStorageProfileRoute:
        async with self.tx() as conn:
            resolved = await self.route_service.resolve_locked(
                profile_id=binding.profile_id,
                revision_id=binding.profile_revision_id,
                conn=conn,
            )
            if resolved.binding != binding:
                raise JobExecutionStateInvariantError(
                    "Resolved route does not match the exact Storage Profile binding "
                    f"for Profile {binding.profile_id} Revision {binding.profile_revision_id}"
                )
        return resolved

    async def register_effect(
        self,
        *,
        lease: JobExecutionLease,
        registration: ProviderEffectRegistration,
    ) -> tuple[ProviderEffectSnapshot, JobExecutionControlSnapshot]:
        manifest = self.contracts.validate_manifest(
            effect_type=registration.effect_type,
            schema_version=registration.schema_version,
            value=registration.manifest,
        )
        manifest_hash = hash_json(manifest)
        async with self.tx() as conn:
            job = await self._get_job(lease=lease, conn=conn)
            attempt = await self._get_attempt(lease=lease, conn=conn)
            initial_control = await self._locked_control(
                job=job,
                attempt=attempt,
                lease=lease,
                conn=conn,
            )
            if initial_control.cancellation_requested:
                raise JobExecutionCancellationRequestedError(control=initial_control)
            profile = await self.route_repository.get_profile_for_update(
                profile_id=registration.route.profile_id,
                conn=conn,
            )
            existing = await self.effect_repository.get_effect_for_update(
                owner_attempt_id=attempt.id,
                effect_type=registration.effect_type,
                effect_key=registration.effect_key,
                conn=conn,
            )
            control = await self._locked_control(
                job=job,
                attempt=attempt,
                lease=lease,
                conn=conn,
            )
            if control.cancellation_requested:
                raise JobExecutionCancellationRequestedError(control=control)
            if profile is None:
                if existing is None:
                    raise ProviderEffectRegistrationProfileUnavailableError(
                        profile_id=registration.route.profile_id,
                    )
                if existing.profile_id != registration.route.profile_id:
                    raise JobExecutionStateInvariantError(
                        f"Provider effect {existing.id} registration cannot replace existing evidence"
                    )
                raise JobExecutionStateInvariantError(
                    f"Provider effect {existing.id} registered Storage profile no longer exists"
                )
            revision = await self._validate_route_binding(
                profile=profile,
                binding=registration.route,
                conn=conn,
            )
            if existing is None:
                if profile.tombstoned_at is not None or not profile.is_active:
                    raise ProviderEffectRegistrationProfileUnavailableError(
                        profile_id=profile.id,
                    )
                current_binding = await self.route_service.materialize_locked_profile(
                    profile=profile,
                    conn=conn,
                )
                if current_binding != registration.route:
                    raise ProviderEffectRegistrationRouteStaleError(
                        profile_id=profile.id,
                        expected_route_hash=registration.route.route_hash,
                        observed_route_hash=current_binding.route_hash,
                    )
                effect = await self.effect_repository.create_effect(
                    job=job,
                    owner_attempt=attempt,
                    profile=profile,
                    profile_revision=revision,
                    effect_type=registration.effect_type,
                    effect_key=registration.effect_key,
                    schema_version=registration.schema_version,
                    manifest=manifest,
                    manifest_hash=manifest_hash,
                    registered_at=control.observed_at,
                    conn=conn,
                )
            else:
                effect = existing
            snapshots = await self._validate_persisted_effects(
                effects=(effect,),
                expected_job_id=job.id,
                expected_owner_attempt_id=attempt.id,
                conn=conn,
            )
            if existing is not None:
                self._validate_registration_replay(
                    effect=existing,
                    registration=registration,
                    manifest=manifest,
                    manifest_hash=manifest_hash,
                )
            await self._renew(attempt=attempt, control=control, conn=conn)
            snapshot = snapshots[0]
        return snapshot, control

    async def list_effects(
        self,
        *,
        lease: JobExecutionLease,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]:
        return await self._list_effects_with_fence(lease=lease, active_only=False)

    async def list_active_effects(
        self,
        *,
        lease: JobExecutionLease,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]:
        return await self._list_effects_with_fence(lease=lease, active_only=True)

    async def list_effects_for_recovery(
        self,
        *,
        lease: JobExecutionLease,
        source_job_id: UUID,
        effect_type: str,
        schema_version: int,
    ) -> tuple[ProviderEffectRecoverySnapshot, JobExecutionControlSnapshot]:
        """List one terminal source Job's effects under a fenced maintenance Job."""

        async with self.tx() as conn:
            recovery_job, recovery_attempt, source_job = await self._lock_recovery_authority(
                lease=lease,
                source_job_id=source_job_id,
                effect_type=effect_type,
                schema_version=schema_version,
                conn=conn,
            )
            effects = await self.effect_repository.list_effects_for_job_contract_for_update(
                job_id=source_job_id,
                effect_type=effect_type,
                schema_version=schema_version,
                conn=conn,
            )
            control = await self._locked_control(
                job=recovery_job,
                attempt=recovery_attempt,
                lease=lease,
                conn=conn,
            )
            snapshots = await self._validate_persisted_effects(
                effects=effects,
                expected_job_id=source_job_id,
                conn=conn,
            )
            await self._renew(attempt=recovery_attempt, control=control, conn=conn)
        return (
            ProviderEffectRecoverySnapshot(
                source_job_id=source_job.id,
                workspace_id=source_job.workspace_id,
                project_id=source_job.project_id,
                site_id=source_job.site_id,
                effects=snapshots,
            ),
            control,
        )

    async def _list_effects_with_fence(
        self,
        *,
        lease: JobExecutionLease,
        active_only: bool,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]:
        async with self.tx() as conn:
            job = await self._get_job(lease=lease, conn=conn)
            attempt = await self._get_attempt(lease=lease, conn=conn)
            await self._locked_control(
                job=job,
                attempt=attempt,
                lease=lease,
                conn=conn,
            )
            if active_only:
                effects = await self.effect_repository.list_active_effects_for_job_for_update(
                    job_id=job.id,
                    conn=conn,
                )
            else:
                effects = await self.effect_repository.list_all_effects_for_job_for_update(
                    job_id=job.id,
                    conn=conn,
                )
            control = await self._locked_control(
                job=job,
                attempt=attempt,
                lease=lease,
                conn=conn,
            )
            snapshots = await self._validate_persisted_effects(
                effects=effects,
                expected_job_id=job.id,
                conn=conn,
            )
            await self._renew(attempt=attempt, control=control, conn=conn)
        return snapshots, control

    async def settle_effects(
        self,
        *,
        lease: JobExecutionLease,
        settlement: ProviderEffectSettlement,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]:
        async with self.tx() as conn:
            job = await self._get_job(lease=lease, conn=conn)
            attempt = await self._get_attempt(lease=lease, conn=conn)
            await self._locked_control(job=job, attempt=attempt, lease=lease, conn=conn)
            effects = await self.effect_repository.list_effects_for_update(
                job_id=job.id,
                effect_ids=settlement.effect_ids,
                conn=conn,
            )
            if tuple(effect.id for effect in effects) != settlement.effect_ids:
                raise JobExecutionStateInvariantError(
                    f"Provider effect settlement for Job {job.id} does not identify its exact effect rows"
                )
            control = await self._locked_control(
                job=job,
                attempt=attempt,
                lease=lease,
                conn=conn,
            )
            await self._validate_persisted_effects(
                effects=effects,
                expected_job_id=job.id,
                conn=conn,
            )
            for effect in effects:
                reference = self.contracts.validate_settlement_reference(
                    effect_type=effect.effect_type,
                    schema_version=effect.schema_version,
                    disposition=settlement.disposition,
                    value=settlement.settlement_reference,
                )
                await self._settle_effect(
                    effect=effect,
                    attempt=attempt,
                    settlement=settlement,
                    reference=reference,
                    settled_at=control.observed_at,
                    conn=conn,
                )
            await self._renew(attempt=attempt, control=control, conn=conn)
            snapshots = tuple(self._validate_effect_contract(effect) for effect in effects)
        return snapshots, control

    async def settle_effects_for_recovery(
        self,
        *,
        lease: JobExecutionLease,
        source_job_id: UUID,
        effect_type: str,
        schema_version: int,
        settlement: ProviderEffectSettlement,
    ) -> tuple[tuple[ProviderEffectSnapshot, ...], JobExecutionControlSnapshot]:
        """Settle exact source effects using the real fenced maintenance Attempt."""

        async with self.tx() as conn:
            recovery_job, recovery_attempt, _source_job = await self._lock_recovery_authority(
                lease=lease,
                source_job_id=source_job_id,
                effect_type=effect_type,
                schema_version=schema_version,
                conn=conn,
            )
            effects = await self.effect_repository.list_effects_for_update(
                job_id=source_job_id,
                effect_ids=settlement.effect_ids,
                conn=conn,
            )
            if tuple(effect.id for effect in effects) != settlement.effect_ids:
                raise JobExecutionStateInvariantError(
                    f"Provider effect recovery settlement for Job {source_job_id} does not identify exact effect rows"
                )
            self._require_recovery_effect_scope(
                effects=effects,
                effect_type=effect_type,
                schema_version=schema_version,
            )
            control = await self._locked_control(
                job=recovery_job,
                attempt=recovery_attempt,
                lease=lease,
                conn=conn,
            )
            await self._validate_persisted_effects(
                effects=effects,
                expected_job_id=source_job_id,
                conn=conn,
            )
            for effect in effects:
                reference = self.contracts.validate_settlement_reference(
                    effect_type=effect.effect_type,
                    schema_version=effect.schema_version,
                    disposition=settlement.disposition,
                    value=settlement.settlement_reference,
                )
                await self._settle_effect(
                    effect=effect,
                    attempt=recovery_attempt,
                    settlement=settlement,
                    reference=reference,
                    settled_at=control.observed_at,
                    conn=conn,
                )
            snapshots = await self._validate_persisted_effects(
                effects=effects,
                expected_job_id=source_job_id,
                conn=conn,
            )
            await self._renew(attempt=recovery_attempt, control=control, conn=conn)
        return snapshots, control

    async def resolve_effect_route(self, *, effect_id: UUID) -> ResolvedStorageProfileRoute:
        async with self.tx() as conn:
            effect_hint = await self.effect_repository.get_effect(effect_id=effect_id, conn=conn)
            if effect_hint is None:
                raise JobExecutionStateInvariantError(f"Provider effect {effect_id} does not exist")
            await self._validate_persisted_effects(
                effects=(effect_hint,),
                expected_job_id=None,
                conn=conn,
            )
            resolved = await self.route_service.resolve_locked(
                profile_id=effect_hint.profile_id,
                revision_id=effect_hint.profile_revision_id,
                conn=conn,
            )
            effect = await self.effect_repository.get_effect_by_id_for_update(
                effect_id=effect_id,
                conn=conn,
            )
            if effect is None:
                raise JobExecutionStateInvariantError(f"Provider effect {effect_id} no longer exists")
            self._validate_resolution_identity_stable(initial=effect_hint, locked=effect)
            await self._validate_persisted_effects(
                effects=(effect,),
                expected_job_id=None,
                conn=conn,
            )
            return resolved

    async def _lock_recovery_authority(
        self,
        *,
        lease: JobExecutionLease,
        source_job_id: UUID,
        effect_type: str,
        schema_version: int,
        conn: BaseDBAsyncClient,
    ) -> tuple[BackgroundJobRecord, JobAttemptRecord, BackgroundJobRecord]:
        recovery_job = await self._get_job(lease=lease, conn=conn)
        recovery_attempt = await self._get_attempt(lease=lease, conn=conn)
        await self._locked_control(
            job=recovery_job,
            attempt=recovery_attempt,
            lease=lease,
            conn=conn,
        )
        target = self._validate_recovery_job(recovery_job)
        if (
            target.source_job_id != source_job_id
            or target.effect_type != effect_type
            or target.schema_version != schema_version
        ):
            raise JobExecutionStateInvariantError(
                f"Provider effect recovery Job {recovery_job.id} does not authorize the requested source contract"
            )
        if source_job_id == recovery_job.id:
            raise JobExecutionStateInvariantError("Provider effect recovery Job cannot target itself")
        source_job = await self.job_repository.get_job_for_update(job_id=source_job_id, conn=conn)
        if source_job is None:
            raise JobExecutionStateInvariantError(f"Provider effect recovery source Job {source_job_id} does not exist")
        if JobInternalStatus(source_job.internal_status) not in _RECOVERY_SOURCE_TERMINAL_STATUSES:
            raise JobExecutionStateInvariantError(
                f"Provider effect recovery source Job {source_job_id} is not terminal and recoverable"
            )
        return recovery_job, recovery_attempt, source_job

    @staticmethod
    def _validate_recovery_job(job: BackgroundJobRecord) -> ProviderEffectRecoveryTarget:
        if (
            job.job_type != PROVIDER_EFFECT_RECOVERY_JOB_TYPE
            or job.job_type_version != PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION
            or job.task_name != PROVIDER_EFFECT_RECOVERY_TASK_NAME
            or JobWorkloadClass(job.workload_class) != JobWorkloadClass.MAINTENANCE
            or JobAuthorityMode(job.authority_mode) != JobAuthorityMode.SYSTEM_SERVICE
        ):
            raise JobExecutionStateInvariantError(
                f"Background Job {job.id} is not a Provider Effect recovery authority"
            )
        try:
            return ProviderEffectRecoveryTarget.model_validate(job.target_descriptor)
        except ValueError as exc:
            raise JobExecutionStateInvariantError(
                f"Provider effect recovery Job {job.id} has an invalid target contract"
            ) from exc

    @staticmethod
    def _require_recovery_effect_scope(
        *,
        effects: Sequence[ProviderEffectRecord],
        effect_type: str,
        schema_version: int,
    ) -> None:
        if any(effect.effect_type != effect_type or effect.schema_version != schema_version for effect in effects):
            raise JobExecutionStateInvariantError(
                "Provider effect recovery settlement includes evidence outside its authorized contract"
            )

    async def _get_job(
        self,
        *,
        lease: JobExecutionLease,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobRecord:
        job = await self.job_repository.get_job_for_update(job_id=lease.job_id, conn=conn)
        if job is None:
            raise JobExecutionStateInvariantError(f"Background Job {lease.job_id} does not exist")
        return job

    async def _get_attempt(
        self,
        *,
        lease: JobExecutionLease,
        conn: BaseDBAsyncClient,
    ) -> JobAttemptRecord:
        attempt = await self.job_repository.get_job_attempt_for_update(
            job_id=lease.job_id,
            attempt_id=lease.attempt_id,
            conn=conn,
        )
        if attempt is None:
            raise JobExecutionStateInvariantError(f"Background Job Attempt {lease.attempt_id} does not exist")
        return attempt

    async def _locked_control(
        self,
        *,
        job: BackgroundJobRecord,
        attempt: JobAttemptRecord,
        lease: JobExecutionLease,
        conn: BaseDBAsyncClient,
    ) -> JobExecutionControlSnapshot:
        return build_execution_control_snapshot(
            job=job,
            attempt=attempt,
            lease=lease,
            observed_at=await self.job_repository.get_database_time(conn=conn),
        )

    async def _renew(
        self,
        *,
        attempt: JobAttemptRecord,
        control: JobExecutionControlSnapshot,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.job_repository.heartbeat_attempt(
            attempt=attempt,
            heartbeat_at=control.observed_at,
            lease_until=control.lease_until,
            conn=conn,
        )

    async def _validate_route_binding(
        self,
        *,
        profile: StorageProfile,
        binding: StorageProfileRouteBinding,
        conn: BaseDBAsyncClient,
    ) -> StorageProfileRouteRevision:
        if binding.profile_id != profile.id:
            raise JobExecutionStateInvariantError("Provider effect route binding identifies another profile")
        revision = await self.route_repository.get_route_revision(
            profile_id=profile.id,
            revision_id=binding.profile_revision_id,
            conn=conn,
        )
        if revision is None:
            raise JobExecutionStateInvariantError(
                f"Storage profile route revision {binding.profile_revision_id} does not exist"
            )
        route = self.route_service.validate_persisted_revision(revision)
        if revision.route_hash != binding.route_hash or route != binding.route:
            raise JobExecutionStateInvariantError(
                f"Storage profile route revision {revision.id} does not match the pre-resolved binding"
            )
        return revision

    @staticmethod
    def _validate_registration_replay(
        *,
        effect: ProviderEffectRecord,
        registration: ProviderEffectRegistration,
        manifest,
        manifest_hash: str,
    ) -> None:
        matches = (
            effect.profile_id == registration.route.profile_id
            and effect.profile_revision_id == registration.route.profile_revision_id
            and effect.schema_version == registration.schema_version
            and effect.manifest_hash == manifest_hash
            and effect.manifest == manifest
        )
        if not matches:
            raise JobExecutionStateInvariantError(
                f"Provider effect {effect.id} registration cannot replace existing evidence"
            )

    @staticmethod
    def _validate_resolution_identity_stable(
        *,
        initial: ProviderEffectRecord,
        locked: ProviderEffectRecord,
    ) -> None:
        initial_identity = (
            initial.job_id,
            initial.owner_attempt_id,
            initial.profile_id,
            initial.profile_revision_id,
            initial.effect_type,
            initial.effect_key,
            initial.schema_version,
            initial.manifest,
            initial.manifest_hash,
            initial.registered_at,
        )
        locked_identity = (
            locked.job_id,
            locked.owner_attempt_id,
            locked.profile_id,
            locked.profile_revision_id,
            locked.effect_type,
            locked.effect_key,
            locked.schema_version,
            locked.manifest,
            locked.manifest_hash,
            locked.registered_at,
        )
        if locked_identity != initial_identity:
            raise JobExecutionStateInvariantError(
                f"Provider effect {locked.id} identity changed during route resolution"
            )

    def _validate_effect_contract(self, effect: ProviderEffectRecord) -> ProviderEffectSnapshot:
        snapshot = ProviderEffectSnapshot.from_record(effect)
        manifest = self.contracts.validate_manifest(
            effect_type=effect.effect_type,
            schema_version=effect.schema_version,
            value=snapshot.manifest,
        )
        if manifest != snapshot.manifest:
            raise JobExecutionStateInvariantError(
                f"Provider effect {effect.id} manifest is not canonical for its registered contract"
            )
        if snapshot.disposition != ProviderEffectDisposition.ACTIVE:
            if snapshot.settlement_reference is None:
                raise JobExecutionStateInvariantError(
                    f"Provider effect {effect.id} terminal contract is missing settlement evidence"
                )
            settlement_reference = self.contracts.validate_settlement_reference(
                effect_type=effect.effect_type,
                schema_version=effect.schema_version,
                disposition=snapshot.disposition,
                value=snapshot.settlement_reference,
            )
            if settlement_reference != snapshot.settlement_reference:
                raise JobExecutionStateInvariantError(
                    f"Provider effect {effect.id} settlement is not canonical for its registered contract"
                )
        return snapshot

    async def _validate_persisted_effects(
        self,
        *,
        effects: Sequence[ProviderEffectRecord],
        expected_job_id: UUID | None,
        conn: BaseDBAsyncClient,
        expected_owner_attempt_id: UUID | None = None,
    ) -> tuple[ProviderEffectSnapshot, ...]:
        snapshots = tuple(self._validate_effect_contract(effect) for effect in effects)
        attempt_ids = {
            attempt_id
            for effect in effects
            for attempt_id in (effect.owner_attempt_id, effect.settled_by_attempt_id)
            if attempt_id is not None
        }
        attempts = await self.effect_repository.list_attempts_by_ids(
            attempt_ids=tuple(sorted(attempt_ids, key=lambda attempt_id: attempt_id.int)),
            conn=conn,
        )
        attempt_job_ids = {attempt.id: attempt.job_id for attempt in attempts}
        settlement_job_ids = {
            attempt_job_ids[effect.settled_by_attempt_id]
            for effect in effects
            if effect.settled_by_attempt_id is not None
            and effect.settled_by_attempt_id in attempt_job_ids
            and attempt_job_ids[effect.settled_by_attempt_id] != effect.job_id
        }
        settlement_jobs = await self.effect_repository.list_jobs_by_ids(
            job_ids=tuple(sorted(settlement_job_ids, key=lambda job_id: job_id.int)),
            conn=conn,
        )
        settlement_jobs_by_id = {job.id: job for job in settlement_jobs}
        revision_ids = tuple(sorted({effect.profile_revision_id for effect in effects}, key=lambda value: value.int))
        revisions = await self.route_repository.list_route_revisions_by_ids(
            revision_ids=revision_ids,
            conn=conn,
        )
        revisions_by_id = {revision.id: revision for revision in revisions}

        for effect in effects:
            if expected_job_id is not None and effect.job_id != expected_job_id:
                raise JobExecutionStateInvariantError(
                    f"Provider effect {effect.id} does not belong to its locked registered Job"
                )
            if expected_owner_attempt_id is not None and effect.owner_attempt_id != expected_owner_attempt_id:
                raise JobExecutionStateInvariantError(
                    f"Provider effect {effect.id} does not belong to its locked owner Attempt"
                )
            if attempt_job_ids.get(effect.owner_attempt_id) != effect.job_id:
                raise JobExecutionStateInvariantError(
                    f"Provider effect {effect.id} owner Attempt does not belong to its registered Job"
                )
            self._validate_settlement_authority(
                effect=effect,
                attempt_job_ids=attempt_job_ids,
                settlement_jobs_by_id=settlement_jobs_by_id,
            )
            revision = revisions_by_id.get(effect.profile_revision_id)
            if revision is None or revision.profile_id != effect.profile_id:
                raise JobExecutionStateInvariantError(
                    f"Provider effect {effect.id} Route Revision does not belong to its Storage Profile"
                )
            self.route_service.validate_persisted_revision(revision)
        return snapshots

    def _validate_settlement_authority(
        self,
        *,
        effect: ProviderEffectRecord,
        attempt_job_ids: dict[UUID, UUID],
        settlement_jobs_by_id: dict[UUID, BackgroundJobRecord],
    ) -> None:
        if effect.settled_by_attempt_id is None:
            return
        settlement_job_id = attempt_job_ids.get(effect.settled_by_attempt_id)
        if settlement_job_id is None:
            raise JobExecutionStateInvariantError(f"Provider effect {effect.id} settling Attempt does not exist")
        if settlement_job_id == effect.job_id:
            return
        settlement_job = settlement_jobs_by_id.get(settlement_job_id)
        if settlement_job is None:
            raise JobExecutionStateInvariantError(f"Provider effect {effect.id} settling Job does not exist")
        target = self._validate_recovery_job(settlement_job)
        if (
            target.source_job_id != effect.job_id
            or target.effect_type != effect.effect_type
            or target.schema_version != effect.schema_version
        ):
            raise JobExecutionStateInvariantError(
                f"Provider effect {effect.id} settling Attempt is not authorized for its source contract"
            )

    async def _settle_effect(
        self,
        *,
        effect: ProviderEffectRecord,
        attempt: JobAttemptRecord,
        settlement: ProviderEffectSettlement,
        reference,
        settled_at,
        conn: BaseDBAsyncClient,
    ) -> None:
        ProviderEffectSnapshot.from_record(effect)
        current = ProviderEffectDisposition(effect.disposition)
        if current == ProviderEffectDisposition.ACTIVE:
            changed = await self.effect_repository.settle_active_effect(
                effect=effect,
                disposition=settlement.disposition,
                settled_at=settled_at,
                settled_by_attempt_id=attempt.id,
                settlement_reference=reference,
                conn=conn,
            )
            if changed != 1:
                raise JobExecutionStateInvariantError(f"Provider effect {effect.id} settlement compare-and-set failed")
            effect.disposition = settlement.disposition
            effect.settled_at = settled_at
            effect.settled_by_attempt_id = attempt.id
            effect.settlement_reference = reference
            return

        if current == settlement.disposition and effect.settlement_reference == reference:
            return
        raise JobExecutionStateInvariantError(f"Provider effect {effect.id} cannot change its terminal settlement")
