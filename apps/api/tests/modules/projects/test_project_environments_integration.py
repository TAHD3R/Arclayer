from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.projects.environment import ProjectEnvironmentRecord
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_new_project_bootstraps_three_environments_and_lists_in_predictable_order(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        response = await client.get(f"/api/v1/projects/{project_id}/environments")
        assert response.status_code == 200, response.text

        items = response.json()["data"]["items"]
        assert [item["key"] for item in items] == ["development", "staging", "production"]
        assert [item["isProduction"] for item in items] == [False, False, True]
        assert [item["isDefaultPreview"] for item in items] == [True, False, False]

        db_rows = (
            await ProjectEnvironmentRecord
            .filter(project_id=decode_public_id(project_id))
            .order_by("created_at", "id")
            .all()
        )
        assert len(db_rows) == 3

        second_project_res = await client.post(
            "/api/v1/projects",
            json={
                "workspaceId": workspace_id,
                "name": "Second Project",
                "slug": "second-project",
            },
        )
        assert second_project_res.status_code == 201, second_project_res.text
        second_project_id = second_project_res.json()["data"]["id"]

        second_response = await client.get(f"/api/v1/projects/{second_project_id}/environments")
        assert second_response.status_code == 200, second_response.text
        assert [item["key"] for item in second_response.json()["data"]["items"]] == [
            "development",
            "staging",
            "production",
        ]


@pytest.mark.asyncio
async def test_project_environment_patch_updates_name_and_default_preview(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        initial = await client.get(f"/api/v1/projects/{project_id}/environments")
        assert initial.status_code == 200, initial.text
        staging = next(item for item in initial.json()["data"]["items"] if item["key"] == "staging")

        patch_res = await client.patch(
            f"/api/v1/projects/{project_id}/environments/{staging['id']}",
            json={"name": "QA", "isDefaultPreview": True},
        )
        assert patch_res.status_code == 200, patch_res.text
        assert patch_res.json()["data"]["name"] == "QA"
        assert patch_res.json()["data"]["isDefaultPreview"] is True

        refreshed = await client.get(f"/api/v1/projects/{project_id}/environments")
        assert refreshed.status_code == 200, refreshed.text
        rows = refreshed.json()["data"]["items"]
        assert [item["key"] for item in rows if item["isDefaultPreview"]] == ["staging"]
