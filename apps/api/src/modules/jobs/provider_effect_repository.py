from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.jobs.background_job import BackgroundJobRecord, JobAttemptRecord
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.models.storage.storage_profile import StorageProfile, StorageProfileRouteRevision


class ProviderEffectRepository(TortoiseORMRepository[ProviderEffectRecord]):
    def __init__(self) -> None:
        super().__init__(ProviderEffectRecord)

    async def get_effect(
        self,
        *,
        effect_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ProviderEffectRecord | None:
        query = ProviderEffectRecord.filter(id=effect_id)
        return await self.using_db(query, conn).first()

    async def get_effect_by_id_for_update(
        self,
        *,
        effect_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ProviderEffectRecord | None:
        return await ProviderEffectRecord.filter(id=effect_id).using_db(conn).select_for_update().first()

    async def get_effect_for_update(
        self,
        *,
        owner_attempt_id: UUID,
        effect_type: str,
        effect_key: str,
        conn: BaseDBAsyncClient,
    ) -> ProviderEffectRecord | None:
        return await (
            ProviderEffectRecord
            .filter(
                owner_attempt_id=owner_attempt_id,
                effect_type=effect_type,
                effect_key=effect_key,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def list_attempts_by_ids(
        self,
        *,
        attempt_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> list[JobAttemptRecord]:
        if not attempt_ids:
            return []
        return await JobAttemptRecord.filter(id__in=attempt_ids).using_db(conn).order_by("id")

    async def list_jobs_by_ids(
        self,
        *,
        job_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> list[BackgroundJobRecord]:
        if not job_ids:
            return []
        return await BackgroundJobRecord.filter(id__in=job_ids).using_db(conn).order_by("id")

    async def create_effect(
        self,
        *,
        job: BackgroundJobRecord,
        owner_attempt: JobAttemptRecord,
        profile: StorageProfile,
        profile_revision: StorageProfileRouteRevision,
        effect_type: str,
        effect_key: str,
        schema_version: int,
        manifest: JsonObject,
        manifest_hash: str,
        registered_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> ProviderEffectRecord:
        return await self.create_record(
            ProviderEffectRecord,
            conn=conn,
            job_id=job.id,
            owner_attempt_id=owner_attempt.id,
            profile_id=profile.id,
            profile_revision_id=profile_revision.id,
            effect_type=effect_type,
            effect_key=effect_key,
            schema_version=schema_version,
            manifest=manifest,
            manifest_hash=manifest_hash,
            disposition=ProviderEffectDisposition.ACTIVE,
            registered_at=registered_at,
        )

    async def list_active_effects_for_job_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> list[ProviderEffectRecord]:
        query = ProviderEffectRecord.filter(job_id=job_id, disposition=ProviderEffectDisposition.ACTIVE).order_by(
            "registered_at", "id"
        )
        return await query.using_db(conn).select_for_update()

    async def list_all_effects_for_job_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> list[ProviderEffectRecord]:
        query = ProviderEffectRecord.filter(job_id=job_id).order_by("registered_at", "id")
        return await query.using_db(conn).select_for_update()

    async def list_effects_for_job_contract_for_update(
        self,
        *,
        job_id: UUID,
        effect_type: str,
        schema_version: int,
        conn: BaseDBAsyncClient,
    ) -> list[ProviderEffectRecord]:
        query = ProviderEffectRecord.filter(
            job_id=job_id,
            effect_type=effect_type,
            schema_version=schema_version,
        ).order_by("registered_at", "id")
        return await query.using_db(conn).select_for_update()

    async def list_effects_for_update(
        self,
        *,
        job_id: UUID,
        effect_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> list[ProviderEffectRecord]:
        query = ProviderEffectRecord.filter(job_id=job_id, id__in=effect_ids).order_by("id")
        return await query.using_db(conn).select_for_update()

    async def has_active_effects_for_profile(
        self,
        *,
        profile_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> bool:
        return bool(
            await ProviderEffectRecord
            .filter(profile_id=profile_id, disposition=ProviderEffectDisposition.ACTIVE)
            .using_db(conn)
            .exists()
        )

    async def settle_active_effect(
        self,
        *,
        effect: ProviderEffectRecord,
        disposition: ProviderEffectDisposition,
        settled_at: datetime,
        settled_by_attempt_id: UUID,
        settlement_reference: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> int:
        return int(
            await ProviderEffectRecord
            .filter(
                id=effect.id,
                disposition=ProviderEffectDisposition.ACTIVE,
                settled_at__isnull=True,
                settled_by_attempt_id__isnull=True,
                settlement_reference__isnull=True,
            )
            .using_db(conn)
            .update(
                disposition=disposition,
                settled_at=settled_at,
                settled_by_attempt_id=settled_by_attempt_id,
                settlement_reference=settlement_reference,
                updated_at=settled_at,
            )
        )
