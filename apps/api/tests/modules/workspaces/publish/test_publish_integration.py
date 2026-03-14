from __future__ import annotations

import pytest

from apps.api.src.common.utils.public_ids import decode_public_id
from apps.api.src.models.content.publish_artifact import PublishArtifactRecord
from apps.api.src.models.content.published_graph import PublishedGraphRecord
from apps.api.tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


def _model_payload() -> dict:
    return {
        "key": "page",
        "name": "Page",
        "fields": [{"key": "title", "label": "Title", "scalar": "text", "required": True}],
        "relations": [],
        "capabilities": ["versioned", "publishable", "routable", "treeable"],
        "routing": {"mode": "single", "slugField": "title"},
        "workflow": {"states": ["draft", "published"], "initialState": "draft"},
        "views": [],
    }


def _item_payload(slug: str, title: str) -> dict:
    return {
        "modelKey": "page",
        "slug": slug,
        "title": title,
        "locale": "en-US",
        "visibility": "public",
        "status": "draft",
    }


def _draft_payload(title: str) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": "initial draft",
        "fieldsSnapshot": {"title": title},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title}},
            {
                "kind": "visual_blueprint",
                "payload": {
                    "root": "page_root",
                    "nodes": {
                        "page_root": {
                            "type": "stack",
                            "children": ["hero"],
                        },
                        "hero": {
                            "type": "hero_banner",
                            "props": {"headline": title},
                        },
                    },
                },
            },
            {
                "kind": "slot_mapping",
                "payload": {
                    "bindings": [
                        {
                            "componentKey": "hero_banner",
                            "bindingKey": "headline",
                            "payload": {"field": "title"},
                        }
                    ]
                },
            },
            {
                "kind": "seo",
                "payload": {
                    "metaTitle": f"{title} | Celestial",
                    "metaDescription": f"{title} description",
                },
            },
        ],
    }


async def _setup_publishable_items(client, workspace_id: str) -> tuple[str, str]:
    model_res = await client.post(f"/api/v1/workspaces/{workspace_id}/content/models", json=_model_payload())
    assert model_res.status_code == 201, model_res.text

    root_item_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json=_item_payload("home", "Home"),
    )
    assert root_item_res.status_code == 201, root_item_res.text
    root_item_id = root_item_res.json()["data"]["id"]

    child_item_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items",
        json=_item_payload("about", "About"),
    )
    assert child_item_res.status_code == 201, child_item_res.text
    child_item_id = child_item_res.json()["data"]["id"]
    return root_item_id, child_item_id


async def _publish_item(client, workspace_id: str, item_id: str, title: str) -> None:
    draft_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
        json=_draft_payload(title),
    )
    assert draft_res.status_code == 201, draft_res.text

    publish_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_publish_builds_published_graph_from_routes_and_hierarchy(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id, child_item_id = await _setup_publishable_items(client, workspace_id)
        await _publish_item(client, workspace_id, root_item_id, "Home")
        await _publish_item(client, workspace_id, child_item_id, "About")

        root_route_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{root_item_id}",
            json={"locale": "en-US", "path": "/", "isActive": True},
        )
        assert root_route_res.status_code == 200, root_route_res.text

        child_route_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{child_item_id}",
            json={"locale": "en-US", "path": "/about", "isActive": True},
        )
        assert child_route_res.status_code == 200, child_route_res.text

        root_node_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/hierarchy/{root_item_id}",
            json={"parentItemId": None, "sortOrder": 0},
        )
        assert root_node_res.status_code == 200, root_node_res.text

        child_node_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/hierarchy/{child_item_id}",
            json={"parentItemId": root_item_id, "sortOrder": 10},
        )
        assert child_node_res.status_code == 200, child_node_res.text

        impact_res = await client.get(f"/api/v1/workspaces/{workspace_id}/publish/impact")
        assert impact_res.status_code == 200, impact_res.text
        assert impact_res.json()["data"]["missingRoutes"] == []
        assert impact_res.json()["data"]["unpublishedDependencies"] == []

        publish_res = await client.post(f"/api/v1/workspaces/{workspace_id}/publish/artifacts", json={})
        assert publish_res.status_code == 200, publish_res.text
        assert publish_res.json()["data"]["graphNodes"] == 2

        root_uuid = decode_public_id(root_item_id)
        child_uuid = decode_public_id(child_item_id)
        graph_rows = await PublishedGraphRecord.filter(item_id__in=[root_uuid, child_uuid]).all()
        assert len(graph_rows) == 2
        child_row = next(row for row in graph_rows if row.item_id == child_uuid)
        assert child_row.hierarchy_parent_item_id == root_uuid

        artifact_rows = await PublishArtifactRecord.filter(item_id__in=[root_uuid, child_uuid]).all()
        assert len(artifact_rows) >= 5
        artifact_kinds = {row.artifact_kind for row in artifact_rows}
        assert "route_manifest" in artifact_kinds
        assert "component_manifest" in artifact_kinds
        assert "binding_manifest" in artifact_kinds
        assert "render_hints" in artifact_kinds
        assert "seo_metadata" in artifact_kinds


@pytest.mark.asyncio
async def test_publish_returns_blocking_impact_when_route_missing(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        root_item_id, _ = await _setup_publishable_items(client, workspace_id)
        await _publish_item(client, workspace_id, root_item_id, "Home")

        impact_res = await client.get(f"/api/v1/workspaces/{workspace_id}/publish/impact")
        assert impact_res.status_code == 200, impact_res.text
        assert impact_res.json()["data"]["missingRoutes"] == [root_item_id]

        publish_res = await client.post(f"/api/v1/workspaces/{workspace_id}/publish/artifacts", json={})
        assert publish_res.status_code == 409, publish_res.text
        assert publish_res.json()["error"] == "PUBLISH_IMPACT_BLOCKING"
