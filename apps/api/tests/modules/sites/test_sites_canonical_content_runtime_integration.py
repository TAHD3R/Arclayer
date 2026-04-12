from __future__ import annotations

import pytest

from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


def _page_model_payload() -> dict:
    return {
        "key": "page",
        "name": "Page",
        "fields": [{"key": "title", "label": "Title", "scalar": "text", "required": True}],
        "relations": [],
        "capabilities": ["versioned", "publishable", "routable", "visual_editable"],
        "routing": {"mode": "single", "slugField": "title"},
        "workflow": {"states": ["draft", "published"], "initialState": "draft"},
        "views": [],
    }


def _component_model_payload() -> dict:
    return {
        "key": "header_component",
        "name": "Header Component",
        "fields": [{"key": "title", "label": "Title", "scalar": "text", "required": True}],
        "relations": [],
        "capabilities": ["versioned", "publishable", "visual_editable"],
        "routing": {"mode": "none"},
        "workflow": {"states": ["draft", "published"], "initialState": "draft"},
        "views": [],
    }


def _header_doc(title: str) -> dict:
    return {
        "version": 1,
        "rootId": "page",
        "nodesById": {
            "page": {
                "id": "page",
                "type": "page_root",
                "name": "Page",
                "children": ["h1"],
                "layout": {"children": {"mode": "absolute"}},
            },
            "h1": {
                "id": "h1",
                "type": "text",
                "text": {"en-US": title},
                "tag": "h1",
                "layout": {
                    "self": {"rect": {"x": 0, "y": 0, "width": 720, "height": 0}},
                    "children": {"mode": "absolute"},
                },
            },
        },
    }


def _page_doc_with_ref(*, ref_entry_id: str, title: str) -> dict:
    return {
        "version": 1,
        "rootId": "page",
        "nodesById": {
            "page": {
                "id": "page",
                "type": "page_root",
                "name": "Page",
                "children": ["heading", "ref1"],
                "seo": {"title": {"en-US": title}},
                "layout": {"children": {"mode": "absolute"}},
            },
            "heading": {
                "id": "heading",
                "type": "text",
                "text": {"en-US": title},
                "tag": "h1",
                "layout": {
                    "self": {"rect": {"x": 0, "y": 0, "width": 720, "height": 0}},
                    "children": {"mode": "absolute"},
                },
            },
            "ref1": {
                "id": "ref1",
                "type": "content_ref",
                "refEntryId": ref_entry_id,
                "refState": "published",
            },
        },
    }


def _item_payload(model_key: str, slug: str, title: str) -> dict:
    return {
        "modelKey": model_key,
        "slug": slug,
        "title": title,
        "locale": "en-US",
        "visibility": "public",
        "status": "draft",
    }


def _draft_payload(*, title: str, doc: dict, seo_description: str) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": "initial draft",
        "fieldsSnapshot": {"title": title},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title}},
            {"kind": "visual_blueprint", "payload": doc},
            {
                "kind": "seo",
                "payload": {
                    "metaTitle": f"{title} | Arclayer",
                    "metaDescription": seo_description,
                },
            },
        ],
    }


async def _create_model(client, workspace_id: str, payload: dict) -> None:
    res = await client.post(f"/api/v1/workspaces/{workspace_id}/content/models", json=payload)
    assert res.status_code == 201, res.text


async def _create_item(client, workspace_id: str, payload: dict) -> str:
    res = await client.post(f"/api/v1/workspaces/{workspace_id}/content/items", json=payload)
    assert res.status_code == 201, res.text
    return res.json()["data"]["id"]


async def _publish_item(client, workspace_id: str, item_id: str, payload: dict) -> None:
    draft_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
        json=payload,
    )
    assert draft_res.status_code == 201, draft_res.text

    publish_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_sites_route_resolve_reads_canonical_content_items_and_includes(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _create_model(client, workspace_id, _page_model_payload())
        await _create_model(client, workspace_id, _component_model_payload())

        header_item_id = await _create_item(
            client,
            workspace_id,
            _item_payload("header_component", "header", "Header"),
        )
        about_item_id = await _create_item(
            client,
            workspace_id,
            _item_payload("page", "about", "About"),
        )

        await _publish_item(
            client,
            workspace_id,
            header_item_id,
            _draft_payload(
                title="Header",
                doc=_header_doc("Header"),
                seo_description="Header description",
            ),
        )
        await _publish_item(
            client,
            workspace_id,
            about_item_id,
            _draft_payload(
                title="About",
                doc=_page_doc_with_ref(ref_entry_id=header_item_id, title="About"),
                seo_description="About description",
            ),
        )

        route_res = await client.put(
            f"/api/v1/workspaces/{workspace_id}/content/routing/bindings/{about_item_id}",
            json={"locale": "en-US", "path": "/about", "isActive": True},
        )
        assert route_res.status_code == 200, route_res.text

        site_res = await client.get(f"/api/v1/workspaces/{workspace_id}/site")
        assert site_res.status_code == 200, site_res.text
        site_id = site_res.json()["data"]["siteId"]

        resolve_res = await client.get(
            f"/api/v1/sites/{site_id}/routes/resolve",
            params={"path": "/about", "mode": "public"},
        )
        assert resolve_res.status_code == 200, resolve_res.text
        payload = resolve_res.json()["data"]

        assert payload["match"]["kind"] == "page"
        assert payload["match"]["pageId"] == about_item_id
        assert payload["pageMeta"]["title"] == "About | Arclayer"
        assert payload["pageMeta"]["description"] == "About description"
        assert payload["dataSources"]["primaryEntry"]["id"] == about_item_id
        assert payload["dataSources"]["primaryEntry"]["data"]["fields"]["title"] == "About"

        include = payload["includes"][f"{header_item_id}:published"]
        assert include["entryId"] == header_item_id
        assert include["resolvedState"] == "published"
        assert include["pageBlueprint"] is not None
