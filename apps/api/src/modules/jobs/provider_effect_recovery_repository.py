from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.jobs.background_job import JobInternalStatus
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.modules.jobs.provider_effect_recovery import ProviderEffectRecoveryCandidate

_RECOVERABLE_SOURCE_STATUSES = (
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
)


class ProviderEffectRecoveryRepository(TortoiseORMRepository[ProviderEffectRecord]):
    def __init__(self) -> None:
        super().__init__(ProviderEffectRecord)

    async def list_candidates_for_update(
        self,
        *,
        effect_type: str,
        schema_version: int,
        limit: int,
        conn: BaseDBAsyncClient,
    ) -> tuple[ProviderEffectRecoveryCandidate, ...]:
        query = (
            ProviderEffectRecord
            .filter(
                disposition=ProviderEffectDisposition.ACTIVE,
                effect_type=effect_type,
                schema_version=schema_version,
                job__internal_status__in=_RECOVERABLE_SOURCE_STATUSES,
            )
            .order_by("registered_at", "id")
            .limit(limit)
        )
        effects = await query.using_db(conn).select_for_update(skip_locked=True)
        candidates: dict[tuple[UUID, str, int], ProviderEffectRecoveryCandidate] = {}
        for effect in effects:
            identity = (effect.job_id, effect.effect_type, effect.schema_version)
            candidates.setdefault(
                identity,
                ProviderEffectRecoveryCandidate(
                    source_job_id=effect.job_id,
                    effect_type=effect.effect_type,
                    schema_version=effect.schema_version,
                ),
            )
        return tuple(candidates.values())
