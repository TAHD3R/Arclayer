from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content.content_item import ContentItemRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_article_model,
    _item_payload,
    _workspace_client,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_content_model_create_persists_and_exposes_continuation_defaults(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={
                "key": "article",
                "name": "Article",
                "defaultEditor": "rich_text",
                "fields": [],
                "relations": [],
                "capabilities": ["publishable", "rich_text_editable"],
                "routing": {"mode": "none"},
                "workflow": {"states": []},
                "views": [],
            },
        )
        assert response.status_code == 201, response.text
        payload = response.json()["data"]
        assert payload["defaultRole"] == "article"
        assert payload["defaultPosture"] == "structured"
        assert payload["defaultSurface"] == "writing"

        saved = await ContentModelDefinitionRecord.filter(key="article").first()
        assert saved is not None
        assert str(saved.default_role) == "article"
        assert str(saved.default_posture) == "structured"
        assert str(saved.default_surface) == "writing"

        list_response = await client.get(f"/api/v1/projects/{project_id}/content/models")
        assert list_response.status_code == 200, list_response.text
        listed = list_response.json()["data"]["items"][0]
        assert listed["defaultRole"] == "article"
        assert listed["defaultPosture"] == "structured"
        assert listed["defaultSurface"] == "writing"


@pytest.mark.asyncio
async def test_content_item_shape_persists_resolved_truth_and_open_intent(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        create_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert create_res.status_code == 201, create_res.text
        item = create_res.json()["data"]
        item_id = item["id"]
        assert item["shapeState"] == "ready"
        assert item.get("shapeReasonCode") is None
        assert item["resolvedRole"] == "article"
        assert item["resolvedSurface"] == "writing"
        assert item["derivedStatus"] == "draft"
        assert item["runtime"] == "text"
        assert item["context"] == "content_library"
        assert item["libraryGroup"] == "general-content"
        assert item["editWith"] == "writing"
        assert item["role"] == "article"
        assert item["openIntent"]["blocked"] is False
        assert item["openIntent"]["route"] == f"/w/{workspace_id}/content/library/{item_id}"
        assert item["continuationTarget"]["route"] == item["openIntent"]["route"]

        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text
        shaped = shape_res.json()["data"]
        assert shaped["resolvedRole"] == "article"
        assert shaped["resolvedPosture"] == "structured"
        assert shaped["resolvedSurface"] == "writing"
        assert shaped["shapeState"] == "ready"
        assert shaped.get("shapeReasonCode") is None
        assert shaped["derivedStatus"] == "draft"
        assert shaped["runtime"] == "text"
        assert shaped["context"] == "content_library"
        assert shaped["libraryGroup"] == "general-content"
        assert shaped["editWith"] == "writing"
        assert shaped["role"] == "article"
        assert shaped["openIntent"]["blocked"] is False
        assert shaped["openIntent"]["surface"] == "writing"
        assert shaped["openIntent"]["route"] == f"/w/{workspace_id}/content/library/{item_id}"

        row = await ContentItemRecord.get(id=decode_public_id(item_id))
        assert str(row.resolved_role) == "article"
        assert str(row.resolved_posture) == "structured"
        assert str(row.resolved_surface) == "writing"
        assert str(row.shape_state) == "ready"
        assert row.shape_reason_code is None

        duplicate_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/duplicate",
            json={},
        )
        assert duplicate_res.status_code == 200, duplicate_res.text
        duplicate = duplicate_res.json()["data"]
        assert duplicate["resolvedRole"] == "article"
        assert duplicate["resolvedPosture"] == "structured"
        assert duplicate["resolvedSurface"] == "writing"
        assert duplicate["shapeState"] == "ready"
        assert duplicate["runtime"] == "text"
        assert duplicate["libraryGroup"] == "general-content"
        assert duplicate["editWith"] == "writing"
        assert duplicate["role"] == "article"
