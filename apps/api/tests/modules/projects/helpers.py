from __future__ import annotations

from tests.modules.workspaces.content.test_content_items_integration import _bootstrap_shape_payload
from tests.utils.project_context import project_context_ids

__all__ = [
    "bind_project_hierarchy",
    "bind_project_route",
    "create_project_article_model",
    "create_project_content_model",
    "create_project_page_model",
    "create_project_page_model_for_environment",
    "create_project_publishable_page_item",
    "prepare_project_publishable_tree",
    "project_context_ids",
    "project_page_draft_payload",
    "project_page_item_payload",
    "publish_project_item_version",
    "setup_project_publishable_items",
]


async def create_project_content_model(client, project_id: str, **overrides: object) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/models",
        json={
            "singularKey": "article",
            "pluralKey": "articles",
            "name": "Article",
            "fields": [],
            "relations": [],
            "capabilities": [],
            "routing": {"mode": "none"},
            "workflow": {"states": []},
            "views": [],
            **overrides,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


async def create_project_article_model(client, project_id: str) -> dict:
    return await create_project_content_model(
        client,
        project_id,
        category="content_library",
        defaultEditor="rich_text",
        capabilities=["publishable", "rich_text_editable"],
        defaultRole="article",
        defaultPosture="structured",
        defaultSurface="writing",
    )


async def create_project_page_model(client, project_id: str) -> dict:
    return await create_project_content_model(
        client,
        project_id,
        singularKey="page",
        pluralKey="pages",
        name="Page",
        category="site_builder",
        capabilities=["publishable", "routable", "treeable"],
        defaultRole="page",
        defaultPosture="page",
        defaultSurface="structured",
    )


async def create_project_page_model_for_environment(client, project_id: str, *, environment_key: str) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/models",
        params={"environment": environment_key},
        json={
            "singularKey": "page",
            "pluralKey": "pages",
            "name": "Page",
            "fields": [],
            "relations": [],
            "capabilities": ["publishable", "routable", "treeable"],
            "routing": {"mode": "none"},
            "workflow": {"states": []},
            "views": [],
            "category": "site_builder",
            "defaultRole": "page",
            "defaultPosture": "page",
            "defaultSurface": "structured",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def project_page_item_payload(*, title: str) -> dict:
    return {
        "title": title,
        "locale": "en-US",
        "modelKey": "page",
    }


def project_page_draft_payload(title: str, *, path: str, expected_version: int = 0) -> dict:
    return {
        "expectedVersion": expected_version,
        "changeSummary": f"draft {expected_version + 1}",
        "fieldsSnapshot": {"title": title, "path": path},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title, "path": path}},
            {
                "kind": "visual_blueprint",
                "payload": {
                    "root": "page_root",
                    "nodes": {
                        "page_root": {"type": "stack", "children": ["hero"]},
                        "hero": {"type": "hero_banner", "props": {"headline": title}},
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


async def create_project_publishable_page_item(client, project_id: str, *, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=project_page_item_payload(title=title),
    )
    assert item_res.status_code == 201, item_res.text
    item_id = item_res.json()["data"]["id"]

    shape_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="page",
            capability_pack_ids=["publishable", "routable", "treeable"],
        ),
    )
    assert shape_res.status_code == 200, shape_res.text
    return item_id


async def setup_project_publishable_items(client, project_id: str) -> tuple[str, str]:
    await create_project_page_model(client, project_id)
    root_item_id = await create_project_publishable_page_item(client, project_id, title="Home")
    child_item_id = await create_project_publishable_page_item(client, project_id, title="About")
    return root_item_id, child_item_id


async def publish_project_item_version(
    client,
    project_id: str,
    item_id: str,
    *,
    version: int = 2,
    title: str,
    path: str,
) -> None:
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=project_page_draft_payload(title, path=path, expected_version=version - 1),
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
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/{version}/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


async def prepare_project_publishable_tree(client, project_id: str) -> tuple[str, str]:
    root_item_id, child_item_id = await setup_project_publishable_items(client, project_id)
    await bind_project_route(client, project_id, root_item_id, path="/")
    await bind_project_route(client, project_id, child_item_id, path="/about")
    await bind_project_hierarchy(client, project_id, root_item_id, parent_item_id=None, sort_order=0)
    await bind_project_hierarchy(client, project_id, child_item_id, parent_item_id=root_item_id, sort_order=10)
    return root_item_id, child_item_id


async def bind_project_route(client, project_id: str, item_id: str, *, path: str) -> None:
    route_res = await client.put(
        f"/api/v1/projects/{project_id}/content/routing/bindings/{item_id}",
        json={"locale": "en-US", "path": path, "isActive": True},
    )
    assert route_res.status_code == 200, route_res.text


async def bind_project_hierarchy(
    client,
    project_id: str,
    item_id: str,
    *,
    parent_item_id: str | None,
    sort_order: int,
) -> None:
    node_res = await client.put(
        f"/api/v1/projects/{project_id}/content/routing/hierarchy/{item_id}",
        json={"parentItemId": parent_item_id, "sortOrder": sort_order},
    )
    assert node_res.status_code == 200, node_res.text
