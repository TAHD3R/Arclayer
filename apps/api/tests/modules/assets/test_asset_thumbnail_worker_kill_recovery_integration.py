from __future__ import annotations

import asyncio
import os
import signal
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from orjson import dumps
from redis.asyncio import Redis
from tortoise.transactions import in_transaction

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
from src.modules.assets.jobs.thumbnail_provider_effects import AssetThumbnailProviderEffectManifestV1
from src.modules.jobs.provider_effect_recovery_service import ProviderEffectRecoveryEnqueueService
from src.modules.jobs.reaper_service import BackgroundJobLeaseReaperService
from src.modules.jobs.repository import BackgroundJobRepository
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

_PROCESS_WAIT_SECONDS = 20.0
_POLL_SECONDS = 0.02


async def _capture_output(stream: asyncio.StreamReader, lines: list[str]) -> None:
    while line := await stream.readline():
        lines.append(line.decode(errors="replace").rstrip())
        del lines[:-200]


async def _start_asset_worker() -> tuple[asyncio.subprocess.Process, asyncio.Task[None], list[str]]:
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "scripts.run_taskiq_worker",
        JobWorkloadClass.ASSET_CPU.value,
        cwd=Path(__file__).parents[3],
        env=os.environ.copy(),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        start_new_session=True,
    )
    assert process.stdout is not None
    lines: list[str] = []
    capture = asyncio.create_task(_capture_output(process.stdout, lines))
    return process, capture, lines


async def _kill_worker(
    process: asyncio.subprocess.Process,
    capture: asyncio.Task[None],
) -> None:
    if process.returncode is None:
        os.killpg(process.pid, signal.SIGKILL)
    await asyncio.wait_for(process.wait(), timeout=_PROCESS_WAIT_SECONDS)
    await capture


async def _wait_for_active_written_effect(
    *,
    job_id: UUID,
    root: Path,
    expected_effect_count: int,
    process: asyncio.subprocess.Process,
    lines: list[str],
) -> ProviderEffectRecord:
    async def observe() -> ProviderEffectRecord:
        while True:
            effects = await ProviderEffectRecord.filter(job_id=job_id).order_by("registered_at", "id")
            active = next(
                (effect for effect in effects if effect.disposition == ProviderEffectDisposition.ACTIVE),
                None,
            )
            if len(effects) >= expected_effect_count and active is not None:
                manifest = AssetThumbnailProviderEffectManifestV1.model_validate_json(
                    dumps(active.manifest),
                    strict=True,
                )
                if all(safe_object_key_to_path(root, output.object_key).is_file() for output in manifest.outputs):
                    return active
            if process.returncode is not None:
                raise AssertionError(
                    f"asset worker exited before the kill window; code={process.returncode}; logs={lines}"
                )
            await asyncio.sleep(_POLL_SECONDS)

    try:
        return await asyncio.wait_for(observe(), timeout=_PROCESS_WAIT_SECONDS)
    except TimeoutError as exc:
        job = await BackgroundJobRecord.get(id=job_id)
        attempts = await JobAttemptRecord.filter(job_id=job_id).values(
            "attempt_number",
            "status",
            "lease_until",
        )
        async with in_transaction() as conn:
            activities = await conn.execute_query_dict(
                "SELECT pid, state, wait_event_type, wait_event, left(query, 240) AS query "
                "FROM pg_stat_activity "
                "WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle' "
                "ORDER BY pid"
            )
        raise AssertionError(
            "asset worker did not reach the Provider Effect kill window; "
            f"code={process.returncode}; job_phase={job.phase}; "
            f"job_status={job.internal_status}; attempts={attempts}; "
            f"database_activity={activities}; logs={lines}"
        ) from exc


async def _wait_for_lease_expiry(attempt_id: UUID) -> None:
    repository = BackgroundJobRepository()

    async def expired() -> None:
        while True:
            attempt = await JobAttemptRecord.get(id=attempt_id)
            async with in_transaction() as conn:
                now = await repository.get_database_time(conn=conn)
            if attempt.lease_until <= now:
                return
            await asyncio.sleep(_POLL_SECONDS)

    await asyncio.wait_for(expired(), timeout=_PROCESS_WAIT_SECONDS)


async def _wait_for_pending_count(
    *,
    redis: Redis,
    stream: str,
    consumer_group: str,
    expected_count: int,
    process: asyncio.subprocess.Process,
    lines: list[str],
) -> None:
    async def observe() -> None:
        while True:
            pending = await redis.xpending_range(stream, consumer_group, "-", "+", 10)
            if len(pending) == expected_count:
                return
            if process.returncode is not None:
                raise AssertionError(
                    "asset worker exited before pending delivery convergence; "
                    f"code={process.returncode}; pending={pending}; logs={lines}"
                )
            await asyncio.sleep(_POLL_SECONDS)

    await asyncio.wait_for(observe(), timeout=_PROCESS_WAIT_SECONDS)


@asynccontextmanager
async def _locked_tenant_asset(*, workspace_id: str, asset_id: UUID) -> AsyncIterator[None]:
    ready = asyncio.get_running_loop().create_future()
    release = asyncio.Event()

    async def hold() -> None:
        try:
            async with _tenant_conn(workspace_id) as conn:
                locked_asset = await AssetRecord.filter(id=asset_id).using_db(conn).select_for_update().first()
                if locked_asset is None:
                    raise AssertionError("thumbnail target Asset disappeared before worker kill")
                ready.set_result(None)
                await release.wait()
        except BaseException as exc:
            if not ready.done():
                ready.set_exception(exc)
            raise

    holder = asyncio.create_task(hold())
    await asyncio.wait_for(asyncio.shield(ready), timeout=_PROCESS_WAIT_SECONDS)
    try:
        yield
    finally:
        release.set()
        await holder


@pytest.mark.asyncio
async def test_sigkill_retry_exhaustion_fans_out_exact_orphan_cleanup(
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
    monkeypatch.setenv("TASKIQ__STREAM_PREFIX", f"{integration_valkey_settings}:kill-e2e:{token}")
    monkeypatch.setenv("TASKIQ__CONSUMER_GROUP_PREFIX", f"{integration_valkey_settings}:kill-workers:{token}")
    monkeypatch.setenv("TASKIQ__WORKLOADS__ASSET_CPU__IDLE_TIMEOUT_MILLISECONDS", "100")
    monkeypatch.setenv("BACKGROUND_JOBS__ASSET_THUMBNAIL__MAX_ATTEMPTS", "2")
    monkeypatch.setenv("BACKGROUND_JOBS__ASSET_THUMBNAIL__INITIAL_DELAY_SECONDS", "0.1")
    monkeypatch.setenv("BACKGROUND_JOBS__ASSET_THUMBNAIL__MAXIMUM_DELAY_SECONDS", "0.1")
    monkeypatch.setenv("BACKGROUND_JOBS__ASSET_THUMBNAIL__LEASE_SECONDS", "3")
    monkeypatch.setenv("BACKGROUND_JOBS__ASSET_THUMBNAIL__HEARTBEAT_SECONDS", "1")
    get_settings.cache_clear()
    invalidate_core_settings_cache()
    settings = get_settings()
    profile_key = f"kill-e2e-{token}"
    profile_config = StorageProfileConfig(
        provider=ObjectStorageProviderKind.LOCAL,
        local_root_dir=root,
        local_tmp_dir=scratch,
    )
    await StorageProfile.create(
        profile_key=profile_key,
        provider=ObjectStorageProviderKind.LOCAL,
        config_source=StorageProfileConfigSource.DATABASE,
        display_name="Thumbnail SIGKILL recovery E2E",
        config={},
        secret_ref={},
        is_active=True,
        is_default=False,
    )

    async def load_effective_profile(_settings):  # type: ignore[no-untyped-def]
        return profile_key, profile_config

    monkeypatch.setattr(
        "src.modules.assets.admin.uploads.service.get_effective_storage_profile",
        load_effective_profile,
    )
    producer = build_producer_runtime(settings=settings, producer_identity=f"kill-producer:{token}")
    maintenance_worker = build_workload_worker_runtime(
        settings=settings,
        workload_class=JobWorkloadClass.MAINTENANCE,
        consumer_identity=f"kill-maintenance:{token}",
    )
    asset_producer = producer.brokers.select(JobWorkloadClass.ASSET_CPU)
    maintenance_producer = producer.brokers.select(JobWorkloadClass.MAINTENANCE)
    redis = Redis.from_url(settings.taskiq.redis_dsn or settings.valkey.dsn)
    policy = JobDispatchPolicy(
        lease_seconds=settings.background_jobs.dispatcher.lease_seconds,
        max_attempts=settings.background_jobs.dispatcher.max_attempts,
        retry_delay_seconds=settings.background_jobs.dispatcher.retry_delay_seconds,
    )
    streams = (
        asset_producer.queue_name,
        maintenance_worker.broker.queue_name,
    )
    reaper = BackgroundJobLeaseReaperService(
        settings,
        repository=BackgroundJobRepository(),
        retry_jitter=lambda: 0.0,
    )

    await redis.delete(*streams)
    await asset_producer.startup()
    await maintenance_producer.startup()
    await maintenance_worker.broker.startup()
    try:
        async with _workspace_client(prepared_db, integration_valkey_settings) as (
            client,
            workspace_public_id,
            project_public_id,
        ):
            image = _png_bytes()
            initialized = await client.post(
                f"/api/v1/projects/{project_public_id}/uploads/init",
                json={
                    "purpose": "library",
                    "filename": "kill-thumbnail.png",
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
            job = await BackgroundJobRecord.get(job_type="asset.thumbnail.generate", project_id=project_id)

            for expected_effect_count in (1, 2):
                process, capture, lines = await _start_asset_worker()
                try:
                    if expected_effect_count == 2:
                        await _wait_for_pending_count(
                            redis=redis,
                            stream=asset_producer.queue_name,
                            consumer_group=asset_producer.consumer_group_name,
                            expected_count=0,
                            process=process,
                            lines=lines,
                        )
                    async with _locked_tenant_asset(
                        workspace_id=workspace_public_id,
                        asset_id=asset_id,
                    ):
                        assert (
                            await dispatch_once(
                                runtime=producer,
                                dispatcher_id=f"kill-dispatcher:{token}",
                                policy=policy,
                                limit=1,
                            )
                            == 1
                        )
                        try:
                            active = await _wait_for_active_written_effect(
                                job_id=job.id,
                                root=root,
                                expected_effect_count=expected_effect_count,
                                process=process,
                                lines=lines,
                            )
                        finally:
                            await _kill_worker(process, capture)
                finally:
                    if process.returncode is None:
                        await _kill_worker(process, capture)
                pending = await redis.xpending_range(
                    asset_producer.queue_name,
                    asset_producer.consumer_group_name,
                    "-",
                    "+",
                    10,
                )
                assert len(pending) == 1
                attempt = await JobAttemptRecord.get(id=active.owner_attempt_id)
                await _wait_for_lease_expiry(attempt.id)
                outcome = await reaper.reap_exact(job_id=job.id, attempt_id=attempt.id)
                expected_status = (
                    JobInternalStatus.RETRY_SCHEDULED if expected_effect_count == 1 else JobInternalStatus.DEAD_LETTERED
                )
                assert outcome.internal_status == expected_status

            source_job = await BackgroundJobRecord.get(id=job.id)
            effects = await ProviderEffectRecord.filter(job_id=job.id).order_by("registered_at", "id")
            assert source_job.internal_status == JobInternalStatus.DEAD_LETTERED
            assert tuple(effect.disposition for effect in effects) == (
                ProviderEffectDisposition.CLEANED,
                ProviderEffectDisposition.ACTIVE,
            )
            orphan = effects[1]
            batch = await ProviderEffectRecoveryEnqueueService(
                settings,
                contracts=((orphan.effect_type, orphan.schema_version),),
            ).enqueue_due(limit=10)
            assert len(batch.created_job_ids) == 1
            assert (
                await dispatch_once(
                    runtime=producer,
                    dispatcher_id=f"kill-dispatcher:{token}",
                    policy=policy,
                    limit=1,
                )
                == 1
            )
            await _consume_one(maintenance_worker.broker)

            recovered = await ProviderEffectRecord.get(id=orphan.id)
            recovery_job = await BackgroundJobRecord.get(id=batch.created_job_ids[0])
            assert recovery_job.internal_status == JobInternalStatus.SUCCEEDED
            assert recovered.disposition == ProviderEffectDisposition.CLEANED
            assert recovered.settled_by_attempt_id is not None
            manifest = AssetThumbnailProviderEffectManifestV1.model_validate_json(
                dumps(recovered.manifest),
                strict=True,
            )
            assert all(not safe_object_key_to_path(root, output.object_key).exists() for output in manifest.outputs)
    finally:
        await maintenance_worker.broker.shutdown()
        await maintenance_producer.shutdown()
        await asset_producer.shutdown()
        await redis.delete(*streams)
        await redis.aclose()
        get_settings.cache_clear()
        invalidate_core_settings_cache()
