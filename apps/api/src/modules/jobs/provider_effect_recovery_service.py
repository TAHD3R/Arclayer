from __future__ import annotations

from collections.abc import Iterable
from typing import cast

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.i18n import t
from src.core.services import BaseService
from src.modules.jobs.provider_effect_recovery import (
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
    ProviderEffectRecoveryCandidate,
    ProviderEffectRecoveryEnqueueBatch,
    ProviderEffectRecoveryInput,
    ProviderEffectRecoveryTarget,
    build_provider_effect_recovery_source_revision,
)
from src.modules.jobs.provider_effect_recovery_repository import ProviderEffectRecoveryRepository
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService


class ProviderEffectRecoveryEnqueueService(BaseService):
    """Scan terminal orphan groups and fan out one idempotent durable maintenance Job each."""

    def __init__(
        self,
        settings: Settings,
        *,
        contracts: Iterable[tuple[str, int]],
        repository: ProviderEffectRecoveryRepository | None = None,
        jobs: BackgroundJobService | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=None, default_event_source="provider-effect-recovery-scan")
        normalized_contracts = tuple(sorted(set(contracts)))
        if not normalized_contracts:
            raise ValueError("Provider Effect recovery scan requires at least one registered contract")
        self.contracts = normalized_contracts
        self.repository = repository or ProviderEffectRecoveryRepository()
        self.jobs = jobs or BackgroundJobService(settings)

    async def enqueue_due(self, *, limit: int) -> ProviderEffectRecoveryEnqueueBatch:
        if limit < 1:
            raise BadRequest(
                message=t("errors", "BACKGROUND_JOB_REAP_LIMIT_INVALID"),
                error="BACKGROUND_JOB_REAP_LIMIT_INVALID",
            )
        results: list[BackgroundJobCreateResult] = []
        async with self.tx() as conn:
            candidates = await self._list_candidates(limit=limit, conn=conn)
            for candidate in candidates:
                results.append(
                    await self.jobs.create_job_in_transaction(
                        command=self._build_command(candidate),
                        conn=conn,
                    )
                )
        for result in results:
            await self.jobs.publish_created_after_commit(result)
        return ProviderEffectRecoveryEnqueueBatch(
            scanned_count=len(results),
            created_job_ids=tuple(result.job.id for result in results if result.created),
            replayed_job_ids=tuple(result.job.id for result in results if not result.created),
        )

    async def _list_candidates(
        self,
        *,
        limit: int,
        conn: BaseDBAsyncClient,
    ) -> tuple[ProviderEffectRecoveryCandidate, ...]:
        candidates: list[ProviderEffectRecoveryCandidate] = []
        for effect_type, schema_version in self.contracts:
            remaining = limit - len(candidates)
            if remaining == 0:
                break
            selected = await self.repository.list_candidates_for_update(
                effect_type=effect_type,
                schema_version=schema_version,
                limit=remaining,
                conn=conn,
            )
            candidates.extend(selected)
        return tuple(candidates)

    def _build_command(self, candidate: ProviderEffectRecoveryCandidate) -> BackgroundJobCreate:
        definition = self.jobs.registry.require(
            job_type=PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
            job_type_version=PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
        )
        candidate_payload = candidate.model_dump(mode="json", by_alias=False)
        target = ProviderEffectRecoveryTarget.model_validate(candidate_payload)
        input_reference = ProviderEffectRecoveryInput.model_validate(candidate_payload)
        identity = f"{candidate.source_job_id}:{candidate.effect_type}:v{candidate.schema_version}"
        return BackgroundJobCreate(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            authority_mode=definition.authority_mode,
            target_descriptor=_dump(target),
            input_reference=_dump(input_reference),
            idempotency_key=identity,
            source_revision=build_provider_effect_recovery_source_revision(target=target),
            correlation_id=f"provider-effect-recovery:{candidate.source_job_id}",
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
        )


def _dump(value: ProviderEffectRecoveryTarget | ProviderEffectRecoveryInput) -> JsonObject:
    return cast(JsonObject, value.model_dump(mode="json", by_alias=True))
