from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from src.common.constants.assets import ASSET_SCOPE_PROJECT
from src.common.utils.public_ids import decode_public_id
from src.config import get_settings
from src.models.assets.upload import UploadStatus
from src.modules.assets.admin.uploads.repository import UploadsRepository
from src.modules.assets.naming.service import build_scoped_asset_object_key
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.local import safe_object_key_to_path
from src.platform.storage.profile_schema import StorageProfileConfig
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_completion_claim_fences_concurrent_part_mutation(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / "uploads"
    tmp = tmp_path / "uploads_tmp"
    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(root))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(tmp))
    monkeypatch.setenv("STORAGE__UPLOAD_CHUNK_SIZE_MB", "1")
    monkeypatch.setenv("STORAGE__UPLOAD_MAX_FILE_SIZE_MB", "10")
    monkeypatch.setenv("TASKIQ__ENABLED", "true")
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

    claim_transitioned = asyncio.Event()
    release_claim_transaction = asyncio.Event()
    mutation_reached_row_lock = asyncio.Event()
    original_try_claim = UploadsRepository.try_claim_completion
    original_get_session_for_update = UploadsRepository.get_session_for_update

    async def _pause_claim_before_transaction_commit(self, **kwargs):  # type: ignore[no-untyped-def]
        lease = await original_try_claim(self, **kwargs)
        assert lease is not None
        claim_transitioned.set()
        await release_claim_transaction.wait()
        return lease

    async def _observe_row_lock_attempt(self, **kwargs):  # type: ignore[no-untyped-def]
        if claim_transitioned.is_set() and not release_claim_transaction.is_set():
            mutation_reached_row_lock.set()
        return await original_get_session_for_update(self, **kwargs)

    monkeypatch.setattr(UploadsRepository, "try_claim_completion", _pause_claim_before_transaction_commit)
    monkeypatch.setattr(UploadsRepository, "get_session_for_update", _observe_row_lock_attempt)

    original_bytes = b"xyz"
    replacement_bytes = b"replacement"
    completion_task: asyncio.Task | None = None
    mutation_task: asyncio.Task | None = None
    try:
        async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _ws_pid, project_id):
            init = await client.post(
                f"/api/v1/projects/{project_id}/uploads/init",
                json={
                    "purpose": "avatar",
                    "filename": "claim-race.png",
                    "mime": "image/png",
                    "sizeBytes": len(original_bytes),
                },
            )
            assert init.status_code == 200, init.text
            upload = init.json()["data"]
            upload_id = upload["uploadId"]

            part = await client.put(
                f"/api/v1/projects/{project_id}/uploads/{upload_id}/parts/1",
                headers={"Content-Length": str(len(original_bytes))},
                content=original_bytes,
            )
            assert part.status_code == 200, part.text

            completion_task = asyncio.create_task(
                client.post(f"/api/v1/projects/{project_id}/uploads/{upload_id}/complete"),
                name="upload-completion",
            )
            await asyncio.wait_for(claim_transitioned.wait(), timeout=5)

            mutation_task = asyncio.create_task(
                client.put(
                    f"/api/v1/projects/{project_id}/uploads/{upload_id}/parts/1",
                    headers={"Content-Length": str(len(replacement_bytes))},
                    content=replacement_bytes,
                ),
                name="concurrent-part-mutation",
            )
            await asyncio.wait_for(mutation_reached_row_lock.wait(), timeout=5)
            await asyncio.sleep(0)
            assert mutation_task.done() is False

            release_claim_transaction.set()
            complete, mutation = await asyncio.gather(completion_task, mutation_task)

            assert complete.status_code == 200, complete.text
            assert mutation.status_code == 400, mutation.text
            assert mutation.json()["error"] == "UPLOAD_NOT_WRITABLE"

            status = await client.get(f"/api/v1/projects/{project_id}/uploads/{upload_id}")
            assert status.status_code == 200, status.text
            assert status.json()["data"]["status"] == UploadStatus.COMPLETED

            object_key = build_scoped_asset_object_key(
                scope=ASSET_SCOPE_PROJECT,
                scope_id=decode_public_id(project_id),
                asset_id=decode_public_id(upload["reservedAssetId"]),
                ext="png",
            )
            assert safe_object_key_to_path(root, object_key).read_bytes() == original_bytes
    finally:
        release_claim_transaction.set()
        for task in (completion_task, mutation_task):
            if task is not None and not task.done():
                task.cancel()
        await asyncio.gather(
            *(task for task in (completion_task, mutation_task) if task is not None),
            return_exceptions=True,
        )
        get_settings.cache_clear()
