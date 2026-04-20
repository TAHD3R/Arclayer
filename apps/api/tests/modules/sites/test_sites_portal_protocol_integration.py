from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.sites.site_domain import SiteDomainRecord
from src.models.system.setting import SettingRecord
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SITE, SCOPE_TYPE_WORKSPACE
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


def _design_doc(title: str) -> dict:
    return {
        "version": 1,
        "rootId": "page",
        "nodesById": {
            "page": {
                "id": "page",
                "type": "page_root",
                "name": "Page",
                "children": ["h1"],
                "seo": {"title": {"en-US": title}},
                "layout": {
                    "children": {
                        "mode": "auto",
                        "direction": "column",
                        "gap": 0,
                        "padding": 0,
                        "alignItems": "start",
                        "justifyContent": "start",
                        "wrap": "nowrap",
                    }
                },
            },
            "h1": {
                "id": "h1",
                "type": "text",
                "name": "Title",
                "text": {"en-US": title},
                "tag": "h1",
                "layout": {
                    "self": {
                        "rect": {"x": 0, "y": 0, "width": 720, "height": 0},
                        "alignX": "start",
                        "alignY": "start",
                    },
                    "children": {"mode": "absolute"},
                },
                "style": {"typography": {"fontSize": 32, "lineHeight": 40, "fontWeight": 700}},
            },
        },
    }


def _get_seo_title_from_resolved_document(payload: dict) -> str | None:
    data = payload.get("data", {})
    page_meta = data.get("pageMeta")
    if isinstance(page_meta, dict):
        title = page_meta.get("title")
        if isinstance(title, str):
            return title

    doc = data.get("pageBlueprint")
    if not isinstance(doc, dict):
        return None
    root_id = doc.get("rootId")
    nodes = doc.get("nodesById")
    if not isinstance(root_id, str) or not isinstance(nodes, dict):
        return None
    root = nodes.get(root_id)
    if not isinstance(root, dict):
        return None
    seo = root.get("seo")
    if not isinstance(seo, dict):
        return None
    title = seo.get("title")
    if not isinstance(title, dict):
        return None
    value = title.get("en-US")
    return value if isinstance(value, str) else None


def _get_primary_data_title(payload: dict) -> str | None:
    primary = payload.get("data", {}).get("context", {}).get("primary")
    if not isinstance(primary, dict):
        return None
    data = primary.get("data")
    if not isinstance(data, dict):
        title = primary.get("title")
        return title if isinstance(title, str) else None
    title = data.get("title")
    if isinstance(title, str):
        return title
    title = primary.get("title")
    return title if isinstance(title, str) else None


def _page_model_payload() -> dict:
    return {
        "key": "page",
        "name": "Page",
        "fields": [{"key": "hero_variant", "label": "Hero Variant", "scalar": "text", "required": False}],
    }


def _item_payload(title: str) -> dict:
    return {
        "modelKey": "page",
        "title": title,
        "locale": "en-US",
    }


def _draft_payload(*, expected_version: int, title: str, path: str, seo_description: str) -> dict:
    return {
        "expectedVersion": expected_version,
        "changeSummary": f"{title} draft",
        "fieldsSnapshot": {"title": title, "path": path},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title}},
            {"kind": "visual_blueprint", "payload": _design_doc(title)},
            {
                "kind": "seo",
                "payload": {
                    "metaTitle": f"{title} | Arclayer",
                    "metaDescription": seo_description,
                },
            },
        ],
    }


async def _create_item(client, project_id: str, *, title: str) -> str:
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json=_item_payload(title),
    )
    assert response.status_code == 201, response.text
    item_id = response.json()["data"]["id"]
    shape_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
        json={
            "presetKey": "page",
            "presetState": "selected",
            "capabilityPackIds": ["publishable", "routable", "treeable"],
        },
    )
    assert shape_res.status_code == 200, shape_res.text
    return item_id


async def _save_draft(
    client,
    project_id: str,
    *,
    item_id: str,
    expected_version: int,
    title: str,
    path: str,
    seo_description: str,
) -> None:
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=_draft_payload(
            expected_version=expected_version,
            title=title,
            path=path,
            seo_description=seo_description,
        ),
    )
    assert response.status_code == 201, response.text


async def _publish_version(client, project_id: str, *, item_id: str, version_number: int) -> None:
    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={"stage": "approved", "summary": f"Version {version_number} approved for publish"},
    )
    assert workflow_res.status_code == 200, workflow_res.text
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/{version_number}/publish",
        json={},
    )
    assert response.status_code == 200, response.text


async def _bind_route(client, project_id: str, *, item_id: str, path: str) -> None:
    response = await client.put(
        f"/api/v1/projects/{project_id}/content/routing/bindings/{item_id}",
        json={"locale": "en-US", "path": path, "isActive": True},
    )
    assert response.status_code == 200, response.text


async def test_sites_public_preview_draft_publish_flow(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        workspace_uuid = decode_public_id(workspace_id)
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_uuid,
            namespace=CORE_SETTINGS_NAMESPACE,
            value={"site": {"url": "https://example.test"}},
            updated_by=None,
        )

        site_res = await client.get(f"/api/v1/projects/{project_id}/site")
        assert site_res.status_code == 200, site_res.text
        site_id = site_res.json()["data"]["siteId"]
        site_uuid = decode_public_id(site_id)
        await SiteDomainRecord.create(
            site_id=site_uuid,
            hostname="example.test",
            is_verified=True,
            is_active=True,
            verification_token="test-token",
            created_by_user_id=None,
        )

        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SITE,
            scope_id=site_uuid,
            namespace="site.runtime",
            value={"theme": {"cssVars": {"--color-primary": "#ff0000"}}, "fonts": []},
            updated_by=None,
        )

        model_res = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_page_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        about_item_id = await _create_item(client, project_id, title="About")
        world_item_id = await _create_item(client, project_id, title="World")
        new_item_id = await _create_item(client, project_id, title="New")

        await _save_draft(
            client,
            project_id,
            item_id=about_item_id,
            expected_version=0,
            title="About v1",
            path="/about",
            seo_description="About description",
        )
        await _publish_version(client, project_id, item_id=about_item_id, version_number=1)
        await _bind_route(client, project_id, item_id=about_item_id, path="/about")

        await _save_draft(
            client,
            project_id,
            item_id=world_item_id,
            expected_version=0,
            title="Entry world v1",
            path="/blog/world",
            seo_description="World v1 description",
        )
        await _publish_version(client, project_id, item_id=world_item_id, version_number=1)
        await _bind_route(client, project_id, item_id=world_item_id, path="/blog/world")

        resp = await client.get("/api/v1/sites/resolve", params={"host": "example.test"})
        assert resp.status_code == 200
        assert resp.json()["data"]["siteId"] == site_id

        resp = await client.get(f"/api/v1/sites/{site_id}/runtime", params={"mode": "public"})
        assert resp.status_code == 200
        assert resp.json()["data"]["theme"]["cssVars"]["--color-primary"] == "#ff0000"

        resp = await client.get(f"/api/v1/sites/{site_id}/runtime", params={"mode": "preview"})
        assert resp.status_code == 403

        resp = await client.post(f"/api/v1/sites/{site_id}/preview-tokens", json={"ttlSeconds": 600})
        assert resp.status_code == 201
        token = resp.json()["data"]["token"]
        assert isinstance(token, str) and token

        await _save_draft(
            client,
            project_id,
            item_id=world_item_id,
            expected_version=1,
            title="Entry world v2 (draft)",
            path="/blog/world",
            seo_description="World v2 description",
        )

        resp = await client.get(
            f"/api/v1/sites/{site_id}/routes/resolve",
            params={"path": "/blog/world", "mode": "public"},
        )
        assert resp.status_code == 200
        assert _get_seo_title_from_resolved_document(resp.json()) == "Entry world v1 | Arclayer"
        assert _get_primary_data_title(resp.json()) == "Entry world v1"

        resp = await client.get(
            f"/api/v1/sites/{site_id}/routes/resolve",
            params={"path": "/blog/world", "mode": "preview", "token": token},
        )
        assert resp.status_code == 200
        assert _get_seo_title_from_resolved_document(resp.json()) == "Entry world v2 (draft) | Arclayer"
        assert _get_primary_data_title(resp.json()) == "Entry world v2 (draft)"

        await _save_draft(
            client,
            project_id,
            item_id=new_item_id,
            expected_version=0,
            title="Entry new v1 (draft)",
            path="/blog/new",
            seo_description="New v1 description",
        )
        await _bind_route(client, project_id, item_id=new_item_id, path="/blog/new")

        resp = await client.get(
            f"/api/v1/sites/{site_id}/routes/resolve",
            params={"path": "/blog/new", "mode": "public"},
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["match"]["kind"] == "not_found"

        resp = await client.get(
            f"/api/v1/sites/{site_id}/routes/resolve",
            params={"path": "/blog/new", "mode": "preview", "token": token},
        )
        assert resp.status_code == 200
        assert _get_seo_title_from_resolved_document(resp.json()) == "Entry new v1 (draft) | Arclayer"

        await _publish_version(client, project_id, item_id=new_item_id, version_number=1)
        await _publish_version(client, project_id, item_id=world_item_id, version_number=2)

        resp = await client.get(
            f"/api/v1/sites/{site_id}/routes/resolve",
            params={"path": "/blog/world", "mode": "public"},
        )
        assert resp.status_code == 200
        assert _get_seo_title_from_resolved_document(resp.json()) == "Entry world v2 (draft) | Arclayer"

        resp = await client.get(f"/api/v1/sites/{site_id}/sitemap.xml")
        assert resp.status_code == 200
        xml = resp.text
        assert "https://example.test/about" in xml
        assert "https://example.test/blog/world" in xml
        assert "https://example.test/blog/new" in xml
