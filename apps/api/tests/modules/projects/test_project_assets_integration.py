from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.models.assets.asset_folder import AssetFolderRecord
from src.models.assets.asset_tag import AssetTagRecord
from src.models.assets.upload import UploadSessionRecord
from src.modules.tenancy.database import set_tenant_search_path
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


@asynccontextmanager
async def _tenant_conn(workspace_id: str) -> AsyncIterator[BaseDBAsyncClient]:
    workspace_uuid = decode_public_id(workspace_id)
    record = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_uuid)
    assert record is not None
    async with in_transaction() as conn:
        await set_tenant_search_path(conn, record.schema_name)
        yield conn


async def test_project_asset_folders_and_tags_use_project_scope(prepared_db, integration_valkey_settings) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        folder_res = await client.post(
            f"/api/v1/projects/{project_id}/asset-folders",
            json={"name": "Articles", "description": "Editorial images", "sortOrder": 10},
        )
        assert folder_res.status_code == 200, folder_res.text
        folder = folder_res.json()["data"]
        folder_uuid = decode_public_id(folder["id"])

        tag_res = await client.post(f"/api/v1/projects/{project_id}/asset-tags", json={"name": "cover"})
        assert tag_res.status_code == 200, tag_res.text
        tag = tag_res.json()["data"]
        tag_uuid = decode_public_id(tag["id"])

        async with _tenant_conn(workspace_id) as conn:
            folder_row = await AssetFolderRecord.filter(id=folder_uuid).using_db(conn).first()
            tag_row = await AssetTagRecord.filter(id=tag_uuid).using_db(conn).first()
        assert folder_row is not None
        assert tag_row is not None

        assert folder_row.project_id == UUID(str(decode_public_id(project_id)))
        assert folder_row.workspace_id is None
        assert tag_row.project_id == UUID(str(decode_public_id(project_id)))
        assert tag_row.workspace_id is None

        folders_res = await client.get(f"/api/v1/projects/{project_id}/asset-folders")
        assert folders_res.status_code == 200, folders_res.text
        assert [item["id"] for item in folders_res.json()["data"]["items"]] == [folder["id"]]

        tags_res = await client.get(f"/api/v1/projects/{project_id}/asset-tags")
        assert tags_res.status_code == 200, tags_res.text
        assert [item["id"] for item in tags_res.json()["data"]["items"]] == [tag["id"]]

        assets_res = await client.get(f"/api/v1/projects/{project_id}/assets")
        assert assets_res.status_code == 200, assets_res.text


async def test_project_upload_init_uses_project_scope_and_object_key(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        upload_res = await client.post(
            f"/api/v1/projects/{project_id}/uploads/init",
            json={
                "filename": "hero.png",
                "mime": "image/png",
                "sizeBytes": 4,
                "purpose": "library",
                "visibility": "private",
                "indexable": False,
            },
        )
        assert upload_res.status_code == 200, upload_res.text
        data = upload_res.json()["data"]
        upload_uuid = decode_public_id(data["uploadId"])
        project_uuid = decode_public_id(project_id)

        async with _tenant_conn(workspace_id) as conn:
            session = await UploadSessionRecord.filter(id=upload_uuid).using_db(conn).first()

        assert session is not None
        assert session.project_id == UUID(str(project_uuid))
        assert session.workspace_id is None
        assert str(session.object_key).startswith(f"projects/{project_uuid}/assets/")
        assert data["objectKey"] == session.object_key


async def test_project_image_transform_content_endpoint_uses_cached_output(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from PIL import Image

    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(tmp_path / "tmp"))
    get_settings.cache_clear()

    try:
        async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
            project_uuid = UUID(str(decode_public_id(project_id)))

            from src.common.constants.assets import ASSET_SCOPE_PROJECT
            from src.models.assets.asset import AssetPurpose, AssetRecord, AssetVisibility
            from src.modules.assets.naming.service import build_scoped_asset_object_key
            from src.platform.storage.local import safe_object_key_to_path

            async with _tenant_conn(workspace_id) as conn:
                asset = await AssetRecord.create(
                    project_id=project_uuid,
                    purpose=AssetPurpose.LIBRARY,
                    visibility=AssetVisibility.PRIVATE,
                    indexable=False,
                    original_filename="source.png",
                    mime="image/png",
                    ext="png",
                    size_bytes=0,
                    checksum_sha256="source-sha",
                    storage_provider="local",
                    object_key="pending",
                    using_db=conn,
                )
            object_key = build_scoped_asset_object_key(
                scope=ASSET_SCOPE_PROJECT,
                scope_id=project_uuid,
                asset_id=UUID(str(asset.id)),
                ext="png",
            )
            async with _tenant_conn(workspace_id) as conn:
                await AssetRecord.filter(id=asset.id).using_db(conn).update(object_key=object_key)

            source_path = safe_object_key_to_path(get_settings().storage.local_root_dir, object_key)
            source_path.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (640, 320), color=(30, 120, 220)).save(source_path, format="PNG")

            public_asset_id = encode_uuid(UUID(str(asset.id)))
            first = await client.get(
                f"/api/v1/projects/{project_id}/assets/{public_asset_id}/content?w=160&fm=webp&q=70"
            )
            second = await client.get(
                f"/api/v1/projects/{project_id}/assets/{public_asset_id}/content?w=160&fm=webp&q=70"
            )

            assert first.status_code == 200, first.text
            assert second.status_code == 200, second.text
            assert first.headers["content-type"].startswith("image/webp")
            assert first.headers["x-image-transform-cache"] == "miss"
            assert second.headers["x-image-transform-cache"] == "hit"
            assert first.content == second.content
    finally:
        get_settings.cache_clear()
