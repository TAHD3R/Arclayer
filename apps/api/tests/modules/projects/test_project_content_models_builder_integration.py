from __future__ import annotations

import pytest

from tests.modules.workspaces.content.test_content_models_integration import (
    _blank_first_create_payload,
    _workspace_client,
)

pytestmark = pytest.mark.integration


def _model_payload(singular_key: str, plural_key: str, name: str, *, model_kind: str) -> dict:
    return {
        "singularKey": singular_key,
        "pluralKey": plural_key,
        "name": name,
        "modelKind": model_kind,
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
    }


@pytest.mark.asyncio
async def test_project_content_model_builder_creates_collection_single_and_component(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        for payload in (
            _model_payload("article", "articles", "Article", model_kind="collection_type"),
            _model_payload("homepage", "homepages", "Homepage", model_kind="single_type"),
            _model_payload("seo-card", "seo-cards", "SEO Card", model_kind="component"),
        ):
            response = await client.post(
                f"/api/v1/projects/{project_id}/content/models",
                json=payload,
            )
            assert response.status_code == 201, response.text
            data = response.json()["data"]
            assert data["modelKind"] == payload["modelKind"]
            assert data["singularKey"] == payload["singularKey"]
            assert data["pluralKey"] == payload["pluralKey"]
            assert data["systemManaged"] is False
            assert "protocolKey" not in data

        list_response = await client.get(f"/api/v1/projects/{project_id}/content/models")
        assert list_response.status_code == 200, list_response.text
        rows = {item["singularKey"]: item for item in list_response.json()["data"]["items"]}
        assert rows["article"]["modelKind"] == "collection_type"
        assert rows["homepage"]["modelKind"] == "single_type"
        assert rows["seo-card"]["modelKind"] == "component"


@pytest.mark.asyncio
async def test_project_content_model_json_preview_returns_current_draft_schema(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_model_payload("product", "products", "Product", model_kind="collection_type"),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        preview_response = await client.get(
            f"/api/v1/projects/{project_id}/content/models/{model_id}/json-preview",
        )
        assert preview_response.status_code == 200, preview_response.text
        preview = preview_response.json()["data"]
        assert preview["stage"] == "current_draft"
        assert preview["payload"]["model_kind"] == "collection_type"
        assert preview["payload"]["singular_key"] == "product"
        assert preview["payload"]["plural_key"] == "products"
        assert preview["payload"]["fields"][0]["key"] == "title"


@pytest.mark.asyncio
async def test_project_content_model_delete_removes_custom_model(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_model_payload("product", "products", "Product", model_kind="collection_type"),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        delete_response = await client.delete(f"/api/v1/projects/{project_id}/content/models/{model_id}")
        assert delete_response.status_code == 200, delete_response.text

        list_response = await client.get(f"/api/v1/projects/{project_id}/content/models")
        assert list_response.status_code == 200, list_response.text
        assert "product" not in {item["singularKey"] for item in list_response.json()["data"]["items"]}


@pytest.mark.asyncio
async def test_project_content_model_delete_rejects_system_managed_model(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        delete_response = await client.delete(f"/api/v1/projects/{project_id}/content/models/{model_id}")
        assert delete_response.status_code == 409, delete_response.text
        assert delete_response.json()["error"] == "CONTENT_MODEL_DELETE_SYSTEM_MANAGED"
