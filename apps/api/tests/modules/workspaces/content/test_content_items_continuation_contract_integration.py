from __future__ import annotations

import pytest

from apps.api.src.common.utils.public_ids import decode_public_id
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _item_payload,
    _workspace_client,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_content_model_create_persists_and_exposes_continuation_defaults(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
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
        assert payload["defaultPosture"] == "entry"
        assert payload["defaultSurface"] == "writing"

        saved = await ContentModelDefinitionRecord.filter(key="article").first()
        assert saved is not None
        assert str(saved.default_role) == "article"
        assert str(saved.default_posture) == "entry"
        assert str(saved.default_surface) == "writing"

        list_response = await client.get(f"/api/v1/workspaces/{workspace_id}/content/models")
        assert list_response.status_code == 200, list_response.text
        listed = list_response.json()["data"]["items"][0]
        assert listed["defaultRole"] == "article"
        assert listed["defaultPosture"] == "entry"
        assert listed["defaultSurface"] == "writing"


@pytest.mark.asyncio
async def test_content_item_shape_persists_resolved_truth_and_open_intent(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert create_res.status_code == 201, create_res.text
        item = create_res.json()["data"]
        item_id = item["id"]
        assert item["shapeState"] == "unshaped"
        assert item["shapeReasonCode"] == "UNSHAPED_ITEM"
        assert item.get("resolvedRole") is None
        assert item.get("resolvedSurface") is None
        assert item["derivedStatus"] == "draft"
        assert item["runtime"] == "unknown"
        assert item["context"] == "standalone"
        assert item["libraryGroup"] == "general-content"
        assert item["editWith"] == "structured"
        assert item["role"] == "general"
        assert item["openIntent"]["blocked"] is True
        assert item["openIntent"]["route"] == f"/w/{workspace_id}/content/library/{item_id}"
        assert item["continuationTarget"]["route"] == item["openIntent"]["route"]

        shape_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text
        shaped = shape_res.json()["data"]
        assert shaped["resolvedRole"] == "article"
        assert shaped["resolvedPosture"] == "entry"
        assert shaped["resolvedSurface"] == "writing"
        assert shaped["shapeState"] == "ready"
        assert shaped.get("shapeReasonCode") is None
        assert shaped["derivedStatus"] == "draft"
        assert shaped["runtime"] == "text"
        assert shaped["context"] == "standalone"
        assert shaped["libraryGroup"] == "general-content"
        assert shaped["editWith"] == "writing"
        assert shaped["role"] == "article"
        assert shaped["openIntent"]["blocked"] is False
        assert shaped["openIntent"]["surface"] == "writing"
        assert shaped["openIntent"]["route"] == f"/w/{workspace_id}/content/library/{item_id}"

        row = await ContentItemRecord.get(id=decode_public_id(item_id))
        assert str(row.resolved_role) == "article"
        assert str(row.resolved_posture) == "entry"
        assert str(row.resolved_surface) == "writing"
        assert str(row.shape_state) == "ready"
        assert row.shape_reason_code is None

        duplicate_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/duplicate",
            json={},
        )
        assert duplicate_res.status_code == 200, duplicate_res.text
        duplicate = duplicate_res.json()["data"]
        assert duplicate["resolvedRole"] == "article"
        assert duplicate["resolvedPosture"] == "entry"
        assert duplicate["resolvedSurface"] == "writing"
        assert duplicate["shapeState"] == "ready"
        assert duplicate["runtime"] == "text"
        assert duplicate["libraryGroup"] == "general-content"
        assert duplicate["editWith"] == "writing"
        assert duplicate["role"] == "article"
