from __future__ import annotations

from uuid import UUID

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.assets.asset_folder import AssetFolderRecord
from src.models.assets.asset_tag import AssetTagRecord
from src.models.assets.upload import UploadSessionRecord
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


async def test_project_asset_folders_and_tags_use_project_scope(prepared_db, integration_valkey_settings) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
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

        folder_row = await AssetFolderRecord.get(id=folder_uuid)
        tag_row = await AssetTagRecord.get(id=tag_uuid)

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


async def test_project_upload_init_uses_project_scope_and_object_key(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
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

        session = await UploadSessionRecord.get(id=upload_uuid)

        assert session.project_id == UUID(str(project_uuid))
        assert session.workspace_id is None
        assert str(session.object_key).startswith(f"projects/{project_uuid}/assets/")
        assert data["objectKey"] == session.object_key
