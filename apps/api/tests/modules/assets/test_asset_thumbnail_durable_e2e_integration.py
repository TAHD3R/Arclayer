from __future__ import annotations

import asyncio
from inspect import getsource
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from orjson import dumps
from PIL import Image
from redis.asyncio import Redis
from taskiq.acks import AcknowledgeType

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.models.assets.asset import AssetRecord
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobDispatchOutboxRecord,
    JobInternalStatus,
    JobWorkloadClass,
)
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.models.storage.storage_profile import StorageProfile, StorageProfileConfigSource
from src.modules.assets.jobs.thumbnail_provider_effects import (
    AssetThumbnailProviderEffectCommittedReferenceV1,
    AssetThumbnailProviderEffectManifestV1,
)
from src.modules.jobs.provider_effect_schema import ProviderEffectSnapshot
from src.modules.jobs.schema import JobDispatchEnvelope, JobDispatchPolicy
from src.platform.jobs.composition import execution as job_execution_composition
from src.platform.jobs.composition.producer import build_producer_runtime, dispatch_once
from src.platform.jobs.durable.ack import DurableAckReceiver
from src.platform.jobs.workers.factory import build_workload_worker_runtime
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.local import safe_object_key_to_path
from src.platform.storage.profile_schema import StorageProfileConfig
from src.settings.runtime import invalidate_core_settings_cache
from tests.modules.workspaces.content.test_content_items_integration import _tenant_conn, _workspace_client

pytestmark = pytest.mark.integration

_RECEIVER_TIMEOUT_SECONDS = 15


def _png_bytes() -> bytes:
    payload = BytesIO()
    Image.new("RGB", (640, 360), color="navy").save(payload, format="PNG")
    return payload.getvalue()


async def _consume_one(worker_broker) -> None:  # type: ignore[no-untyped-def]
    receiver = DurableAckReceiver(
        worker_broker,
        run_startup=False,
        ack_type=AcknowledgeType.WHEN_SAVED,
        max_async_tasks=1,
        max_prefetch=1,
        max_tasks_to_execute=1,
        wait_tasks_timeout=10,
    )
    await asyncio.wait_for(
        receiver.listen(asyncio.Event()),
        timeout=_RECEIVER_TIMEOUT_SECONDS,
    )


@pytest.mark.asyncio
async def test_project_upload_dispatches_and_executes_thumbnail_job_with_exact_duplicate_reconciliation(
    prepared_db,
    integration_valkey_settings: str,
    tmp_path: Path,
    monkeypatch,
) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    stream_token = uuid4().hex

    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(root))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(scratch))
    monkeypatch.setenv("TASKIQ__ENABLED", "true")
    monkeypatch.setenv("TASKIQ__STREAM_PREFIX", f"{integration_valkey_settings}:thumbnail-e2e:{stream_token}")
    monkeypatch.setenv(
        "TASKIQ__CONSUMER_GROUP_PREFIX",
        f"{integration_valkey_settings}:thumbnail-e2e-workers:{stream_token}",
    )
    get_settings.cache_clear()
    invalidate_core_settings_cache()

    settings = get_settings()
    profile_key = f"thumbnail-e2e-{stream_token}"
    storage_profile = StorageProfileConfig(
        provider=ObjectStorageProviderKind.LOCAL,
        local_root_dir=root,
        local_tmp_dir=scratch,
    )
    profile = await StorageProfile.create(
        profile_key=profile_key,
        provider=ObjectStorageProviderKind.LOCAL,
        config_source=StorageProfileConfigSource.DATABASE,
        display_name="Thumbnail durable E2E",
        config={},
        secret_ref={},
        is_active=True,
        is_default=False,
    )

    async def load_effective_profile(_settings):  # type: ignore[no-untyped-def]
        return profile_key, storage_profile

    monkeypatch.setattr(
        "src.modules.assets.admin.uploads.service.get_effective_storage_profile",
        load_effective_profile,
    )

    composition_source = getsource(job_execution_composition)
    assert "thumbnail_storage" not in composition_source
    assert "ExactAssetThumbnailProviderStorageResolver" in composition_source

    producer = build_producer_runtime(
        settings=settings,
        producer_identity=f"thumbnail-e2e-producer:{stream_token}",
    )
    worker = build_workload_worker_runtime(
        settings=settings,
        workload_class=JobWorkloadClass.ASSET_CPU,
        consumer_identity=f"thumbnail-e2e-worker:{stream_token}",
    )
    producer_broker = producer.brokers.select(JobWorkloadClass.ASSET_CPU)
    redis = Redis.from_url(settings.taskiq.redis_dsn or settings.valkey.dsn)
    stream_name = worker.broker.queue_name
    dispatch_policy = JobDispatchPolicy(
        lease_seconds=settings.background_jobs.dispatcher.lease_seconds,
        max_attempts=settings.background_jobs.dispatcher.max_attempts,
        retry_delay_seconds=settings.background_jobs.dispatcher.retry_delay_seconds,
    )

    await redis.delete(stream_name)
    await producer_broker.startup()
    await worker.broker.startup()
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
                    "filename": "durable-thumbnail.png",
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

            job = await BackgroundJobRecord.get(
                job_type="asset.thumbnail.generate",
                project_id=project_id,
            )
            dispatch = await JobDispatchOutboxRecord.get(job_id=job.id)
            envelope = JobDispatchEnvelope.model_validate(dispatch.envelope)

            assert (
                await dispatch_once(
                    runtime=producer,
                    dispatcher_id=f"thumbnail-e2e-dispatcher:{stream_token}",
                    policy=dispatch_policy,
                    limit=1,
                )
                == 1
            )
            await _consume_one(worker.broker)

            succeeded = await BackgroundJobRecord.get(id=job.id)
            attempt_before = await JobAttemptRecord.get(job_id=job.id)
            attempts_before = await JobAttemptRecord.filter(job_id=job.id).count()
            effect_before = ProviderEffectSnapshot.from_record(await ProviderEffectRecord.get(job_id=job.id))
            manifest = AssetThumbnailProviderEffectManifestV1.model_validate_json(
                dumps(effect_before.manifest),
                strict=True,
            )
            committed_reference = AssetThumbnailProviderEffectCommittedReferenceV1.model_validate_json(
                dumps(effect_before.settlement_reference),
                strict=True,
            )
            async with _tenant_conn(workspace_public_id) as conn:
                asset_before = await AssetRecord.get(id=asset_id, using_db=conn)
            marker_before = asset_before.meta["thumbnail_generation"]
            variants_before = asset_before.variants

            assert succeeded.internal_status == JobInternalStatus.SUCCEEDED
            assert succeeded.result_reference is not None
            assert attempts_before == 1
            assert attempt_before.provider_references is None
            assert marker_before["jobId"] == encode_uuid(succeeded.id)
            assert marker_before["outputIdentity"] == committed_reference.output_identity
            assert variants_before["thumbnails"]
            assert effect_before.disposition == ProviderEffectDisposition.COMMITTED
            assert effect_before.owner_attempt_id == attempt_before.id
            assert effect_before.profile_id == profile.id
            assert manifest.job_id == succeeded.id
            assert manifest.project_id == project_id
            assert manifest.asset_id == asset_id
            assert committed_reference.effect_id == effect_before.id
            assert committed_reference.manifest_hash == effect_before.manifest_hash
            assert all(safe_object_key_to_path(root, output.object_key).is_file() for output in manifest.outputs)
            assert (
                await redis.xpending_range(
                    stream_name,
                    worker.broker.consumer_group_name,
                    "-",
                    "+",
                    10,
                )
                == []
            )

            await producer.transport.dispatch(
                task_name=dispatch.task_name,
                envelope=envelope,
            )
            await _consume_one(worker.broker)

            replayed = await BackgroundJobRecord.get(id=job.id)
            effect_after = ProviderEffectSnapshot.from_record(await ProviderEffectRecord.get(job_id=job.id))
            async with _tenant_conn(workspace_public_id) as conn:
                asset_after = await AssetRecord.get(id=asset_id, using_db=conn)

            assert replayed.internal_status == JobInternalStatus.SUCCEEDED
            assert replayed.completed_at == succeeded.completed_at
            assert await JobAttemptRecord.filter(job_id=job.id).count() == attempts_before
            assert await ProviderEffectRecord.filter(job_id=job.id).count() == 1
            assert effect_after == effect_before
            assert asset_after.meta["thumbnail_generation"] == marker_before
            assert asset_after.variants == variants_before
            assert (
                await redis.xpending_range(
                    stream_name,
                    worker.broker.consumer_group_name,
                    "-",
                    "+",
                    10,
                )
                == []
            )
    finally:
        await worker.broker.shutdown()
        await producer_broker.shutdown()
        await redis.delete(stream_name)
        await redis.aclose()
        get_settings.cache_clear()
        invalidate_core_settings_cache()
