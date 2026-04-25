from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content.model_field import ContentModelFieldRecord
from tests.modules.workspaces.content.test_content_models_integration import _workspace_client

pytestmark = pytest.mark.integration


async def _create_model(client, project_id: str) -> str:
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/models",
        json={
            "key": "product",
            "name": "Product",
            "modelKind": "collection_type",
            "fields": [
                {
                    "key": "title",
                    "label": "Title",
                    "scalar": "text",
                    "required": True,
                }
            ],
            "relations": [],
            "capabilities": ["queryable"],
            "routing": {"mode": "none"},
            "workflow": {"states": ["draft"], "initialState": "draft"},
            "views": [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


@pytest.mark.asyncio
async def test_project_content_model_field_lifecycle_routes_update_draft_schema(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        model_id = await _create_model(client, project_id)

        create_field = await client.post(
            f"/api/v1/projects/{project_id}/content/models/{model_id}/fields",
            json={
                "key": "gallery",
                "label": "Gallery",
                "scalar": "json",
                "required": False,
                "config": {
                    "kind": "media",
                    "assetScope": "project",
                    "assetIdStorage": "internal_project_asset_id",
                    "repeatable": True,
                },
            },
        )
        assert create_field.status_code == 200, create_field.text
        assert create_field.json()["data"]["fieldSchema"]["gallery"]["config"]["assetIdStorage"] == (
            "internal_project_asset_id"
        )

        update_field = await client.patch(
            f"/api/v1/projects/{project_id}/content/models/{model_id}/fields/gallery",
            json={
                "label": "Product gallery",
                "required": True,
            },
        )
        assert update_field.status_code == 200, update_field.text
        assert update_field.json()["data"]["fieldSchema"]["gallery"]["label"] == "Product gallery"
        assert update_field.json()["data"]["fieldSchema"]["gallery"]["required"] is True

        add_dynamic_zone = await client.post(
            f"/api/v1/projects/{project_id}/content/models/{model_id}/fields",
            json={
                "key": "sections",
                "label": "Sections",
                "scalar": "json",
                "required": False,
                "config": {
                    "kind": "dynamic_zone",
                    "components": ["seo_card"],
                    "repeatable": True,
                },
            },
        )
        assert add_dynamic_zone.status_code == 200, add_dynamic_zone.text

        reorder = await client.post(
            f"/api/v1/projects/{project_id}/content/models/{model_id}/fields/reorder",
            json={"fieldKeys": ["sections", "title", "gallery"]},
        )
        assert reorder.status_code == 200, reorder.text

        saved_fields = await ContentModelFieldRecord.filter(
            model_definition_id=decode_public_id(model_id),
        ).order_by("sort_order")
        assert [field.key for field in saved_fields] == ["sections", "title", "gallery"]

        delete_field = await client.delete(
            f"/api/v1/projects/{project_id}/content/models/{model_id}/fields/gallery",
        )
        assert delete_field.status_code == 200, delete_field.text
        assert "gallery" not in delete_field.json()["data"]["fieldSchema"]
