from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from src.common.constants.assets import ASSET_SCOPE_PROJECT
from src.common.utils.public_ids import decode_public_id
from src.config import get_settings
from src.models.analytics.audit_event import AuditEvent
from src.models.assets.asset import AssetRecord
from src.models.assets.upload import UploadSessionRecord, UploadStatus
from src.models.jobs.background_job import BackgroundJobRecord, JobDispatchOutboxRecord
from src.modules.assets.admin.uploads import service as uploads_service_module
from src.modules.assets.naming.service import build_scoped_asset_object_key, build_scoped_upload_part_object_key
from src.modules.jobs.service import BackgroundJobService
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.local import safe_object_key_to_path
from src.platform.storage.profile_schema import StorageProfileConfig
from tests.modules.workspaces.content.test_content_items_integration import _tenant_conn, _workspace_client

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_uploads_resumable_flow(prepared_db, integration_valkey_settings, tmp_path: Path, monkeypatch) -> None:
    """
    Minimal resumable upload flow:
    - init -> status (missing) -> put part(s) -> status -> complete -> idempotent complete
    """

    _ = prepared_db

    # Isolate storage under test temp dir (no writes to repo data/).
    root = tmp_path / "uploads"
    tmp = tmp_path / "uploads_tmp"
    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(root))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(tmp))
    monkeypatch.setenv("STORAGE__UPLOAD_CHUNK_SIZE_MB", "1")  # 1MiB so we can test multipart.
    monkeypatch.setenv("STORAGE__UPLOAD_MAX_FILE_SIZE_MB", "10")
    monkeypatch.setenv("TASKIQ__ENABLED", "true")

    # Settings are cached via lru_cache; clear to make env overrides effective in this test run.
    get_settings.cache_clear()

    async def _integration_local_storage_profile(_settings):  # type: ignore[no-untyped-def]
        return (
            "integration-local",
            StorageProfileConfig(
                provider=ObjectStorageProviderKind.LOCAL,
                local_root_dir=root,
                local_tmp_dir=tmp,
            ),
        )

    monkeypatch.setattr(
        "src.modules.assets.admin.uploads.service.get_effective_storage_profile",
        _integration_local_storage_profile,
    )

    try:
        # Prepare a 2-part payload: 1MiB + 3 bytes.
        part1 = b"a" * (1024 * 1024)
        part2 = b"xyz"
        total = len(part1) + len(part2)

        async with _workspace_client(prepared_db, integration_valkey_settings) as (client, ws_pid, project_id):
            init = await client.post(
                f"/api/v1/projects/{project_id}/uploads/init",
                json={
                    "purpose": "avatar",
                    "filename": "demo.png",
                    "mime": "image/png",
                    "sizeBytes": total,
                },
            )
            assert init.status_code == 200
            upload = init.json()["data"]
            upload_id = upload["uploadId"]
            assert upload["chunkSize"] == 1024 * 1024
            assert upload["totalParts"] == 2

            status = await client.get(f"/api/v1/projects/{project_id}/uploads/{upload_id}")
            assert status.status_code == 200
            assert status.json()["data"]["missingParts"] == [1, 2]

            resp = await client.put(
                f"/api/v1/projects/{project_id}/uploads/{upload_id}/parts/1",
                headers={"Content-Length": str(len(part1))},
                content=part1,
            )
            assert resp.status_code == 200

            status = await client.get(f"/api/v1/projects/{project_id}/uploads/{upload_id}")
            assert status.status_code == 200
            assert status.json()["data"]["missingParts"] == [2]

            resp = await client.put(
                f"/api/v1/projects/{project_id}/uploads/{upload_id}/parts/2",
                headers={"Content-Length": str(len(part2))},
                content=part2,
            )
            assert resp.status_code == 200

            complete = await client.post(f"/api/v1/projects/{project_id}/uploads/{upload_id}/complete")
            assert complete.status_code == 200
            asset_pid = complete.json()["data"]["assetId"]
            asset_uuid = decode_public_id(asset_pid)
            project_uuid = decode_public_id(project_id)
            activity_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/activity"
                f"?eventName=asset.uploaded&entityType=asset&entityId={asset_pid}&page=1&size=10"
            )
            assert activity_res.status_code == 200, activity_res.text
            activity_items = activity_res.json()["data"]["items"]
            assert activity_items[0]["eventName"] == "asset.uploaded"
            assert activity_items[0]["entityId"] == asset_pid
            assert activity_items[0]["workspaceId"] == ws_pid
            assert activity_items[0]["projectId"] == project_id
            assert activity_items[0]["properties"]["project_id"] == str(project_uuid)
            assert "tenant" not in activity_items[0]["properties"]

            thumbnail_jobs = await BackgroundJobRecord.filter(
                job_type="asset.thumbnail.generate",
                project_id=project_uuid,
            ).all()
            assert len(thumbnail_jobs) == 1
            thumbnail_job = thumbnail_jobs[0]
            assert thumbnail_job.internal_status == "pending_dispatch"
            assert thumbnail_job.target_descriptor == {
                "workspaceId": ws_pid,
                "projectId": project_id,
                "entityType": "asset",
                "entityId": asset_pid,
            }
            assert "tenant" not in thumbnail_job.target_descriptor
            assert "schemaName" not in thumbnail_job.target_descriptor
            dispatches = await JobDispatchOutboxRecord.filter(job_id=thumbnail_job.id).all()
            assert len(dispatches) == 1

            # Idempotent complete returns the same asset id.
            complete2 = await client.post(f"/api/v1/projects/{project_id}/uploads/{upload_id}/complete")
            assert complete2.status_code == 200
            assert complete2.json()["data"]["assetId"] == asset_pid
            assert (
                await BackgroundJobRecord.filter(
                    job_type="asset.thumbnail.generate",
                    project_id=project_uuid,
                ).count()
                == 1
            )
            assert await JobDispatchOutboxRecord.filter(job_id=thumbnail_job.id).count() == 1

            upload_uuid = decode_public_id(upload_id)
            async with _tenant_conn(ws_pid) as conn:
                updated = await (
                    UploadSessionRecord
                    .filter(id=upload_uuid)
                    .using_db(conn)
                    .update(expires_at=datetime.now(tz=UTC) - timedelta(days=1))
                )
            assert updated == 1

            completed_status = await client.get(f"/api/v1/projects/{project_id}/uploads/{upload_id}")
            assert completed_status.status_code == 200, completed_status.text
            assert completed_status.json()["data"]["status"] == UploadStatus.COMPLETED

            completed_abort = await client.post(f"/api/v1/projects/{project_id}/uploads/{upload_id}/abort")
            assert completed_abort.status_code == 400, completed_abort.text
            assert completed_abort.json()["error"] == "UPLOAD_NOT_WRITABLE"

            completed_status_after_abort = await client.get(f"/api/v1/projects/{project_id}/uploads/{upload_id}")
            assert completed_status_after_abort.status_code == 200, completed_status_after_abort.text
            assert completed_status_after_abort.json()["data"]["status"] == UploadStatus.COMPLETED

            failed_init = await client.post(
                f"/api/v1/projects/{project_id}/uploads/init",
                json={
                    "purpose": "avatar",
                    "filename": "failed.png",
                    "mime": "image/png",
                    "sizeBytes": len(part2),
                },
            )
            assert failed_init.status_code == 200, failed_init.text
            failed_upload_id = failed_init.json()["data"]["uploadId"]
            failed_upload_uuid = decode_public_id(failed_upload_id)

            failed_part = await client.put(
                f"/api/v1/projects/{project_id}/uploads/{failed_upload_id}/parts/1",
                headers={"Content-Length": str(len(part2))},
                content=part2,
            )
            assert failed_part.status_code == 200, failed_part.text

            original_write_required_activity_event = uploads_service_module.write_required_activity_event

            async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
                if payload.event_name == "asset.uploaded":
                    raise RuntimeError("forced activity write failure: asset.uploaded")
                return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

            monkeypatch.setattr(
                "src.modules.assets.admin.uploads.service.write_required_activity_event",
                _failing_write_required_activity_event,
            )

            audit_count_before = await AuditEvent.filter(event_name="asset.uploaded").count()
            failed_complete = await client.post(f"/api/v1/projects/{project_id}/uploads/{failed_upload_id}/complete")
            assert failed_complete.status_code == 500, failed_complete.text
            monkeypatch.setattr(
                "src.modules.assets.admin.uploads.service.write_required_activity_event",
                original_write_required_activity_event,
            )

            assert await AuditEvent.filter(event_name="asset.uploaded").count() == audit_count_before
            failed_asset_uuid = decode_public_id(failed_init.json()["data"]["reservedAssetId"])
            failed_object_key = build_scoped_asset_object_key(
                scope=ASSET_SCOPE_PROJECT,
                scope_id=project_uuid,
                asset_id=failed_asset_uuid,
                ext="png",
            )
            failed_part_key = build_scoped_upload_part_object_key(
                scope=ASSET_SCOPE_PROJECT,
                scope_id=project_uuid,
                upload_id=failed_upload_uuid,
                part_number=1,
            )
            failed_out_path = safe_object_key_to_path(root, failed_object_key)
            failed_part_path = safe_object_key_to_path(tmp, failed_part_key)

            async with _tenant_conn(ws_pid) as conn:
                failed_session = await UploadSessionRecord.filter(id=failed_upload_uuid).using_db(conn).first()
                failed_asset_exists = await AssetRecord.filter(id=failed_asset_uuid).using_db(conn).exists()

            assert failed_session is not None
            assert failed_session.status == UploadStatus.STORAGE_FINALIZED
            assert failed_session.asset_id is None
            assert failed_session.storage_finalized_at is not None
            assert failed_session.storage_checksum_sha256 is not None
            assert failed_session.completion_claim_token is not None
            assert failed_asset_exists is False
            assert failed_out_path.read_bytes() == part2
            assert failed_part_path.read_bytes() == part2
            assert (
                await BackgroundJobRecord.filter(
                    job_type="asset.thumbnail.generate",
                    project_id=project_uuid,
                ).count()
                == 1
            )

            finalized_status = await client.get(f"/api/v1/projects/{project_id}/uploads/{failed_upload_id}")
            assert finalized_status.status_code == 200, finalized_status.text
            assert finalized_status.json()["data"]["status"] == UploadStatus.STORAGE_FINALIZED

            finalized_put = await client.put(
                f"/api/v1/projects/{project_id}/uploads/{failed_upload_id}/parts/1",
                headers={"Content-Length": str(len(b"replacement"))},
                content=b"replacement",
            )
            assert finalized_put.status_code == 400, finalized_put.text
            assert finalized_put.json()["error"] == "UPLOAD_NOT_WRITABLE"

            finalized_commit = await client.post(
                f"/api/v1/projects/{project_id}/uploads/{failed_upload_id}/parts/1/commit",
                json={"etag": "replacement", "sizeBytes": len(part2)},
            )
            assert finalized_commit.status_code == 400, finalized_commit.text
            assert finalized_commit.json()["error"] == "UPLOAD_COMMIT_NOT_SUPPORTED"

            finalized_abort = await client.post(f"/api/v1/projects/{project_id}/uploads/{failed_upload_id}/abort")
            assert finalized_abort.status_code == 400, finalized_abort.text
            assert finalized_abort.json()["error"] == "UPLOAD_NOT_WRITABLE"

            finalized_status_after_mutations = await client.get(
                f"/api/v1/projects/{project_id}/uploads/{failed_upload_id}"
            )
            assert finalized_status_after_mutations.status_code == 200, finalized_status_after_mutations.text
            assert finalized_status_after_mutations.json()["data"]["status"] == UploadStatus.STORAGE_FINALIZED
            assert failed_out_path.read_bytes() == part2
            assert failed_part_path.read_bytes() == part2

            async with _tenant_conn(ws_pid) as conn:
                finalized_after_mutations = (
                    await UploadSessionRecord.filter(id=failed_upload_uuid).using_db(conn).first()
                )
            assert finalized_after_mutations is not None
            assert finalized_after_mutations.status == UploadStatus.STORAGE_FINALIZED
            assert finalized_after_mutations.completion_claim_token == failed_session.completion_claim_token
            assert finalized_after_mutations.completion_generation == failed_session.completion_generation
            assert finalized_after_mutations.storage_finalized_at == failed_session.storage_finalized_at
            assert finalized_after_mutations.storage_checksum_sha256 == failed_session.storage_checksum_sha256

            activity_retry = await client.post(f"/api/v1/projects/{project_id}/uploads/{failed_upload_id}/complete")
            assert activity_retry.status_code == 200, activity_retry.text
            assert decode_public_id(activity_retry.json()["data"]["assetId"]) == failed_asset_uuid
            assert await AuditEvent.filter(event_name="asset.uploaded").count() == audit_count_before + 1
            assert failed_out_path.read_bytes() == part2
            assert failed_part_path.exists() is False

            async with _tenant_conn(ws_pid) as conn:
                recovered_session = await UploadSessionRecord.filter(id=failed_upload_uuid).using_db(conn).first()
                recovered_asset = await AssetRecord.filter(id=failed_asset_uuid).using_db(conn).first()
            assert recovered_session is not None
            assert recovered_session.status == UploadStatus.COMPLETED
            assert recovered_session.asset_id == failed_asset_uuid
            assert recovered_asset is not None
            assert (
                await BackgroundJobRecord.filter(
                    job_type="asset.thumbnail.generate",
                    project_id=project_uuid,
                ).count()
                == 2
            )

            job_failed_init = await client.post(
                f"/api/v1/projects/{project_id}/uploads/init",
                json={
                    "purpose": "avatar",
                    "filename": "job-failed.png",
                    "mime": "image/png",
                    "sizeBytes": len(part2),
                },
            )
            assert job_failed_init.status_code == 200, job_failed_init.text
            job_failed_upload_id = job_failed_init.json()["data"]["uploadId"]
            job_failed_upload_uuid = decode_public_id(job_failed_upload_id)
            job_failed_asset_uuid = decode_public_id(job_failed_init.json()["data"]["reservedAssetId"])
            job_failed_part = await client.put(
                f"/api/v1/projects/{project_id}/uploads/{job_failed_upload_id}/parts/1",
                headers={"Content-Length": str(len(part2))},
                content=part2,
            )
            assert job_failed_part.status_code == 200, job_failed_part.text

            original_create_job_in_transaction = BackgroundJobService.create_job_in_transaction

            async def _failing_create_job_in_transaction(*_args, **_kwargs):  # type: ignore[no-untyped-def]
                raise RuntimeError("forced thumbnail Job write failure")

            monkeypatch.setattr(
                BackgroundJobService,
                "create_job_in_transaction",
                _failing_create_job_in_transaction,
            )
            job_audit_count_before = await AuditEvent.filter(event_name="asset.uploaded").count()
            job_count_before = await BackgroundJobRecord.filter(
                job_type="asset.thumbnail.generate",
                project_id=project_uuid,
            ).count()
            dispatch_count_before = await JobDispatchOutboxRecord.filter(
                job__job_type="asset.thumbnail.generate",
                job__project_id=project_uuid,
            ).count()
            job_failed_complete = await client.post(
                f"/api/v1/projects/{project_id}/uploads/{job_failed_upload_id}/complete"
            )
            assert job_failed_complete.status_code == 500, job_failed_complete.text
            monkeypatch.setattr(
                BackgroundJobService,
                "create_job_in_transaction",
                original_create_job_in_transaction,
            )

            job_failed_object_key = build_scoped_asset_object_key(
                scope=ASSET_SCOPE_PROJECT,
                scope_id=project_uuid,
                asset_id=job_failed_asset_uuid,
                ext="png",
            )
            job_failed_part_key = build_scoped_upload_part_object_key(
                scope=ASSET_SCOPE_PROJECT,
                scope_id=project_uuid,
                upload_id=job_failed_upload_uuid,
                part_number=1,
            )
            job_failed_out_path = safe_object_key_to_path(root, job_failed_object_key)
            job_failed_part_path = safe_object_key_to_path(tmp, job_failed_part_key)
            assert job_failed_out_path.read_bytes() == part2
            assert job_failed_part_path.read_bytes() == part2
            assert await AuditEvent.filter(event_name="asset.uploaded").count() == job_audit_count_before
            assert (
                await BackgroundJobRecord.filter(
                    job_type="asset.thumbnail.generate",
                    project_id=project_uuid,
                ).count()
                == job_count_before
            )
            assert (
                await JobDispatchOutboxRecord.filter(
                    job__job_type="asset.thumbnail.generate",
                    job__project_id=project_uuid,
                ).count()
                == dispatch_count_before
            )

            async with _tenant_conn(ws_pid) as conn:
                job_failed_session = await UploadSessionRecord.filter(id=job_failed_upload_uuid).using_db(conn).first()
                job_failed_asset_exists = await AssetRecord.filter(id=job_failed_asset_uuid).using_db(conn).exists()
            assert job_failed_session is not None
            assert job_failed_session.status == UploadStatus.STORAGE_FINALIZED
            assert job_failed_session.asset_id is None
            assert job_failed_session.storage_finalized_at is not None
            assert job_failed_session.storage_checksum_sha256 is not None
            assert job_failed_session.completion_claim_token is not None
            assert job_failed_asset_exists is False

            job_retry = await client.post(f"/api/v1/projects/{project_id}/uploads/{job_failed_upload_id}/complete")
            assert job_retry.status_code == 200, job_retry.text
            assert decode_public_id(job_retry.json()["data"]["assetId"]) == job_failed_asset_uuid
            assert job_failed_out_path.read_bytes() == part2
            assert job_failed_part_path.exists() is False
            assert await AuditEvent.filter(event_name="asset.uploaded").count() == job_audit_count_before + 1
            assert (
                await BackgroundJobRecord.filter(
                    job_type="asset.thumbnail.generate",
                    project_id=project_uuid,
                ).count()
                == job_count_before + 1
            )
            assert (
                await JobDispatchOutboxRecord.filter(
                    job__job_type="asset.thumbnail.generate",
                    job__project_id=project_uuid,
                ).count()
                == dispatch_count_before + 1
            )

            # Verify the created asset records uploader.
            async with _tenant_conn(ws_pid) as conn:
                asset = await AssetRecord.filter(id=asset_uuid).using_db(conn).first()
            assert asset is not None
            assert asset.owner_user_id is not None
            assert asset.project_id == project_uuid
            assert asset.workspace_id is None

        # Verify file content on disk (local provider).
        key = build_scoped_asset_object_key(
            scope=ASSET_SCOPE_PROJECT,
            scope_id=project_uuid,
            asset_id=asset_uuid,
            ext="png",
        )
        out_path = safe_object_key_to_path(root, key)
        assert out_path.is_file()
        assert out_path.read_bytes() == part1 + part2
    finally:
        get_settings.cache_clear()
