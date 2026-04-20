from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content.publish_artifact import PublishArtifactRecord
from src.models.content.published_graph import PublishedGraphRecord
from tests.modules.projects.helpers import (
    bind_project_hierarchy,
    bind_project_route,
    create_project_page_model,
    project_context_ids,
)
from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _workspace_client,
)

pytestmark = pytest.mark.integration


def _item_payload(slug: str, title: str) -> dict:
    return {
        "title": title,
        "locale": "en-US",
        "modelKey": "page",
    }


def _draft_payload(title: str, *, path: str) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": "initial draft",
        "fieldsSnapshot": {"title": title, "path": path},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title, "path": path}},
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
                    "metaTitle": f"{title} | Arclayer",
                    "metaDescription": f"{title} description",
                },
            },
        ],
    }


async def _setup_publishable_items(client, project_id: str) -> tuple[str, str]:
    await create_project_page_model(client, project_id)
    root_item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=_item_payload("home", "Home"),
    )
    assert root_item_res.status_code == 201, root_item_res.text
    root_item_id = root_item_res.json()["data"]["id"]
    root_shape_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{root_item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="page",
            capability_pack_ids=["publishable", "routable", "treeable"],
        ),
    )
    assert root_shape_res.status_code == 200, root_shape_res.text

    child_item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=_item_payload("about", "About"),
    )
    assert child_item_res.status_code == 201, child_item_res.text
    child_item_id = child_item_res.json()["data"]["id"]
    child_shape_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{child_item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="page",
            capability_pack_ids=["publishable", "routable", "treeable"],
        ),
    )
    assert child_shape_res.status_code == 200, child_shape_res.text
    return root_item_id, child_item_id


async def _publish_item(client, project_id: str, item_id: str, title: str, *, path: str) -> None:
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=_draft_payload(title, path=path),
    )
    assert draft_res.status_code == 201, draft_res.text

    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={
            "stage": "approved",
            "summary": f"{title} approved for publish",
        },
    )
    assert workflow_res.status_code == 200, workflow_res.text

    publish_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_publish_builds_published_graph_from_routes_and_hierarchy(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        project_id, _runtime_id = await project_context_ids(client, workspace_id)
        root_item_id, child_item_id = await _setup_publishable_items(client, project_id)
        await _publish_item(client, project_id, root_item_id, "Home", path="/")
        await _publish_item(client, project_id, child_item_id, "About", path="/about")
        await bind_project_route(client, project_id, root_item_id, path="/")
        await bind_project_route(client, project_id, child_item_id, path="/about")
        await bind_project_hierarchy(client, project_id, root_item_id, parent_item_id=None, sort_order=0)
        await bind_project_hierarchy(client, project_id, child_item_id, parent_item_id=root_item_id, sort_order=10)

        impact_res = await client.get(f"/api/v1/projects/{project_id}/publish/impact")
        assert impact_res.status_code == 200, impact_res.text
        assert impact_res.json()["data"]["missingRoutes"] == []
        assert impact_res.json()["data"]["unpublishedDependencies"] == []

        publish_res = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
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
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        project_id, _runtime_id = await project_context_ids(client, workspace_id)
        root_item_id, _ = await _setup_publishable_items(client, project_id)
        await _publish_item(client, project_id, root_item_id, "Home", path="/")

        impact_res = await client.get(f"/api/v1/projects/{project_id}/publish/impact")
        assert impact_res.status_code == 200, impact_res.text
        assert impact_res.json()["data"]["missingRoutes"] == [root_item_id]

        publish_res = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
        assert publish_res.status_code == 409, publish_res.text
        assert publish_res.json()["error"] == "PUBLISH_VALIDATION_FAILED"
