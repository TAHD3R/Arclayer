from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from orjson import dumps
from redis.asyncio import Redis

from src.common.utils.public_ids import decode_public_id
from src.config import get_settings
from src.models.assets.asset import AssetRecord
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.models.storage.storage_profile import StorageProfile, StorageProfileConfigSource
from src.modules.assets.jobs import ASSET_THUMBNAIL_OUTCOME_INVALID_CODE
from src.modules.assets.jobs.thumbnail_provider_effects import AssetThumbnailProviderEffectManifestV1
from src.modules.assets.jobs.thumbnail_repository import TenantAssetThumbnailRepository
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.jobs.provider_effect_recovery import PROVIDER_EFFECT_RECOVERY_JOB_TYPE
from src.modules.jobs.provider_effect_recovery_service import ProviderEffectRecoveryEnqueueService
from src.modules.jobs.schema import JobDispatchPolicy
from src.platform.jobs.composition.producer import build_producer_runtime, dispatch_once
from src.platform.jobs.workers.factory import build_workload_worker_runtime
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.local import safe_object_key_to_path
from src.platform.storage.profile_schema import StorageProfileConfig
from src.settings.runtime import invalidate_core_settings_cache
from tests.modules.assets.test_asset_thumbnail_durable_e2e_integration import _consume_one, _png_bytes
from tests.modules.workspaces.content.test_content_items_integration import _tenant_conn, _workspace_client

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_seeded_terminal_thumbnail_orphan_fans_out_and_cleans_through_maintenance_worker(
    prepared_db,
    integration_valkey_settings: str,
    tmp_path: Path,
    monkeypatch,
) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    token = uuid4().hex
    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(root))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(scratch))
    monkeypatch.setenv("TASKIQ__ENABLED", "true")
    monkeypatch.setenv("TASKIQ__STREAM_PREFIX", f"{integration_valkey_settings}:orphan-e2e:{token}")
    monkeypatch.setenv(
        "TASKIQ__CONSUMER_GROUP_PREFIX",
        f"{integration_valkey_settings}:orphan-e2e-workers:{token}",
    )
    get_settings.cache_clear()
    invalidate_core_settings_cache()
    settings = get_settings()
    profile_key = f"orphan-e2e-{token}"
    profile_config = StorageProfileConfig(
        provider=ObjectStorageProviderKind.LOCAL,
        local_root_dir=root,
        local_tmp_dir=scratch,
    )
    await StorageProfile.create(
        profile_key=profile_key,
        provider=ObjectStorageProviderKind.LOCAL,
        config_source=StorageProfileConfigSource.DATABASE,
        display_name="Thumbnail orphan recovery E2E",
        config={},
        secret_ref={},
        is_active=True,
        is_default=False,
    )

    async def load_effective_profile(_settings):  # type: ignore[no-untyped-def]
        return profile_key, profile_config

    async def fail_marker_commit(self, *, write):  # type: ignore[no-untyped-def]
        _ = self, write
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
            safe_message="Forced permanent marker failure after provider writes",
        )

    monkeypatch.setattr(
        "src.modules.assets.admin.uploads.service.get_effective_storage_profile",
        load_effective_profile,
    )
    monkeypatch.setattr(TenantAssetThumbnailRepository, "commit_outcome", fail_marker_commit)

    producer = build_producer_runtime(settings=settings, producer_identity=f"orphan-producer:{token}")
    asset_worker = build_workload_worker_runtime(
        settings=settings,
        workload_class=JobWorkloadClass.ASSET_CPU,
        consumer_identity=f"orphan-asset-worker:{token}",
    )
    maintenance_worker = build_workload_worker_runtime(
        settings=settings,
        workload_class=JobWorkloadClass.MAINTENANCE,
        consumer_identity=f"orphan-maintenance-worker:{token}",
    )
    asset_producer = producer.brokers.select(JobWorkloadClass.ASSET_CPU)
    maintenance_producer = producer.brokers.select(JobWorkloadClass.MAINTENANCE)
    redis = Redis.from_url(settings.taskiq.redis_dsn or settings.valkey.dsn)
    policy = JobDispatchPolicy(
        lease_seconds=settings.background_jobs.dispatcher.lease_seconds,
        max_attempts=settings.background_jobs.dispatcher.max_attempts,
        retry_delay_seconds=settings.background_jobs.dispatcher.retry_delay_seconds,
    )
    streams = (asset_worker.broker.queue_name, maintenance_worker.broker.queue_name)

    await redis.delete(*streams)
    await asset_producer.startup()
    await maintenance_producer.startup()
    await asset_worker.broker.startup()
    await maintenance_worker.broker.startup()
    try:
        image = _png_bytes()
        async with _workspace_client(prepared_db, integration_valkey_settings) as (
            client,
            workspace_public_id,
            project_public_id,
        ):
            initialized = await client.post(
                f"/api/v1/projects/{project_public_id}/uploads/init",
                json={
                    "purpose": "library",
                    "filename": "orphan-thumbnail.png",
                    "mime": "image/png",
                    "sizeBytes": len(image),
                },
            )
            assert initialized.status_code == 200, initialized.text
            upload_id = initialized.json()["data"]["uploadId"]
            uploaded = await client.put(
                f"/api/v1/projects/{project_public_id}/uploads/{upload_id}/parts/1",
                headers={"Content-Length": str(len(image))},
                content=image,
            )
            assert uploaded.status_code == 200, uploaded.text
            completed = await client.post(f"/api/v1/projects/{project_public_id}/uploads/{upload_id}/complete")
            assert completed.status_code == 200, completed.text
            asset_id = decode_public_id(completed.json()["data"]["assetId"])
            project_id = decode_public_id(project_public_id)
            source_job = await BackgroundJobRecord.get(
                job_type="asset.thumbnail.generate",
                project_id=project_id,
            )

            assert (
                await dispatch_once(
                    runtime=producer,
                    dispatcher_id=f"orphan-dispatcher:{token}",
                    policy=policy,
                    limit=1,
                )
                == 1
            )
            await _consume_one(asset_worker.broker)

            source_job = await BackgroundJobRecord.get(id=source_job.id)
            effect = await ProviderEffectRecord.get(job_id=source_job.id)
            manifest = AssetThumbnailProviderEffectManifestV1.model_validate_json(
                dumps(effect.manifest),
                strict=True,
            )
            assert source_job.internal_status == JobInternalStatus.FAILED
            assert effect.disposition == ProviderEffectDisposition.CLEANED
            for output in manifest.outputs:
                orphan_path = safe_object_key_to_path(root, output.object_key)
                orphan_path.parent.mkdir(parents=True, exist_ok=True)
                orphan_path.write_bytes(b"seeded-worker-kill-orphan")
            await ProviderEffectRecord.filter(id=effect.id).update(
                disposition=ProviderEffectDisposition.ACTIVE,
                settled_at=None,
                settled_by_attempt_id=None,
                settlement_reference=None,
            )
            effect = await ProviderEffectRecord.get(id=effect.id)
            assert effect.disposition == ProviderEffectDisposition.ACTIVE
            assert all(safe_object_key_to_path(root, output.object_key).is_file() for output in manifest.outputs)
            async with _tenant_conn(workspace_public_id) as conn:
                source_asset = await AssetRecord.get(id=asset_id, using_db=conn)
            source_path = safe_object_key_to_path(root, source_asset.object_key)
            assert source_path.is_file()
            assert source_asset.meta is None or "thumbnail_generation" not in source_asset.meta

            batch = await ProviderEffectRecoveryEnqueueService(
                settings,
                contracts=((effect.effect_type, effect.schema_version),),
            ).enqueue_due(limit=10)
            assert len(batch.created_job_ids) == 1
            recovery_job = await BackgroundJobRecord.get(id=batch.created_job_ids[0])
            assert recovery_job.job_type == PROVIDER_EFFECT_RECOVERY_JOB_TYPE

            assert (
                await dispatch_once(
                    runtime=producer,
                    dispatcher_id=f"orphan-dispatcher:{token}",
                    policy=policy,
                    limit=1,
                )
                == 1
            )
            await _consume_one(maintenance_worker.broker)

            recovery_job = await BackgroundJobRecord.get(id=recovery_job.id)
            recovered_effect = await ProviderEffectRecord.get(id=effect.id)
            recovery_attempt = await JobAttemptRecord.get(job_id=recovery_job.id)
            assert recovery_job.internal_status == JobInternalStatus.SUCCEEDED, (
                recovery_job.error_code,
                recovery_job.error_message,
                recovery_job.error_metadata,
                recovery_job.result_reference,
                recovery_job.phase,
                recovery_job.progress_completed,
                recovery_job.progress_total,
                recovery_attempt.status,
                recovery_attempt.error_code,
                recovered_effect.disposition,
                recovered_effect.settled_by_attempt_id,
                recovered_effect.settlement_reference,
                tuple(safe_object_key_to_path(root, output.object_key).exists() for output in manifest.outputs),
                (scratch / str(source_job.id)).exists(),
            )
            assert recovered_effect.disposition == ProviderEffectDisposition.CLEANED
            assert recovered_effect.settled_by_attempt_id == recovery_attempt.id
            assert all(not safe_object_key_to_path(root, output.object_key).exists() for output in manifest.outputs)
            assert source_path.is_file()
            assert (await BackgroundJobRecord.get(id=source_job.id)).internal_status == JobInternalStatus.FAILED
    finally:
        await maintenance_worker.broker.shutdown()
        await asset_worker.broker.shutdown()
        await maintenance_producer.shutdown()
        await asset_producer.shutdown()
        await redis.delete(*streams)
        await redis.aclose()
        get_settings.cache_clear()
        invalidate_core_settings_cache()
