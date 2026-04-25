from __future__ import annotations

import pytest

from src.models.content.model_definition import ContentModelDefinitionRecord
from tests.modules.workspaces.content.test_content_models_integration import _workspace_client

pytestmark = pytest.mark.integration


def _model_payload(key: str, name: str, *, model_kind: str) -> dict:
    return {
        "key": key,
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
            _model_payload("article", "Article", model_kind="collection_type"),
            _model_payload("homepage", "Homepage", model_kind="single_type"),
            _model_payload("seo_card", "SEO Card", model_kind="component"),
        ):
            response = await client.post(
                f"/api/v1/projects/{project_id}/content/models",
                json=payload,
            )
            assert response.status_code == 201, response.text
            data = response.json()["data"]
            assert data["modelKind"] == payload["modelKind"]
            assert data["key"] == payload["key"]
            assert data["systemManaged"] is False
            assert "protocolKey" not in data

        list_response = await client.get(f"/api/v1/projects/{project_id}/content/models")
        assert list_response.status_code == 200, list_response.text
        rows = {item["key"]: item for item in list_response.json()["data"]["items"]}
        assert rows["article"]["modelKind"] == "collection_type"
        assert rows["homepage"]["modelKind"] == "single_type"
        assert rows["seo_card"]["modelKind"] == "component"

        saved = await ContentModelDefinitionRecord.filter(key="seo_card").first()
        assert saved is not None
        assert saved.model_kind == "component"


@pytest.mark.asyncio
async def test_project_content_model_json_preview_returns_current_draft_schema(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_model_payload("product", "Product", model_kind="collection_type"),
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
        assert preview["payload"]["key"] == "product"
        assert preview["payload"]["fields"][0]["key"] == "title"
