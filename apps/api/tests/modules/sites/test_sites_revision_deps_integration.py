from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.modules.organization.models.organization import Organization
from apps.api.src.modules.sites.models.site import SiteRecord
from apps.api.src.modules.workspaces.models.workspace import Workspace

pytestmark = pytest.mark.integration


async def _bootstrap_site() -> str:
    org = await Organization.create(slug=f"org_{uuid4().hex[:8]}", name="Test Org", is_active=True)
    ws = await Workspace.create(
        organization_id=org.id,
        slug=f"ws_{uuid4().hex[:8]}",
        name="Test Workspace",
        is_active=True,
        created_by_user_id=uuid4(),
    )
    site = await SiteRecord.create(
        workspace_id=ws.id,
        slug=f"site_{uuid4().hex[:8]}",
        name="Test Site",
        is_active=True,
        created_by_user_id=uuid4(),
    )
    return encode_uuid(site.id)


async def _create_preview_token(client: AsyncClient, *, site_id: str) -> str:
    resp = await client.post(f"/api/v1/sites/{site_id}/preview-tokens", json={"ttl_seconds": 600})
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["token"]


def _doc(*, title: str) -> dict:
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
                    "self": {"rect": {"x": 0, "y": 0, "width": 720, "height": 0}, "alignX": "start", "alignY": "start"},
                    "children": {"mode": "absolute"},
                },
                "style": {"typography": {"fontSize": 32, "lineHeight": 40, "fontWeight": 700}},
            },
        },
    }


async def test_page_publish_fails_when_deps_assets_missing(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        site_id = await _bootstrap_site()
        missing_asset_id = encode_uuid(uuid4())

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _create_preview_token(client, site_id=site_id)

            # Save a draft revision with deps pointing to a missing asset id.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/draft?token={token}",
                json={
                    "path": "/about",
                    "pageBlueprint": _doc(title="rev1"),
                    "deps": {"assetIds": [missing_asset_id]},
                    "expectedRevision": 0,
                },
            )
            assert resp.status_code == 201, resp.text

            # Publishing should fail with deps validation.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/publish?token={token}",
                json={"path": "/about", "revision": 1},
            )
            assert resp.status_code == 409, resp.text
            assert resp.json()["error"] == "REVISION_DEPS_MISSING"
            assert missing_asset_id in (resp.json().get("meta", {}) or {}).get("missingAssets", [])


async def test_entry_publish_fails_when_deps_assets_missing(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        site_id = await _bootstrap_site()
        missing_asset_id = encode_uuid(uuid4())

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _create_preview_token(client, site_id=site_id)

            resp = await client.post(
                f"/api/v1/sites/{site_id}/entry-types?token={token}",
                json={"code": "blog_post", "name": "Blog Post"},
            )
            assert resp.status_code == 201, resp.text

            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries?token={token}",
                json={"entryTypeCode": "blog_post", "slug": "hello"},
            )
            assert resp.status_code == 201, resp.text

            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/draft?token={token}",
                json={
                    "entryTypeCode": "blog_post",
                    "slug": "hello",
                    "pageBlueprint": _doc(title="rev1"),
                    "data": None,
                    "deps": {"assetIds": [missing_asset_id]},
                    "expectedRevision": 0,
                },
            )
            assert resp.status_code == 201, resp.text

            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/publish?token={token}",
                json={"entryTypeCode": "blog_post", "slug": "hello", "revision": 1},
            )
            assert resp.status_code == 409, resp.text
            assert resp.json()["error"] == "REVISION_DEPS_MISSING"
            assert missing_asset_id in (resp.json().get("meta", {}) or {}).get("missingAssets", [])


async def test_page_rollback_fails_when_deps_assets_missing(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        site_id = await _bootstrap_site()
        missing_asset_id = encode_uuid(uuid4())

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _create_preview_token(client, site_id=site_id)

            # rev1 without deps (ok)
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/draft?token={token}",
                json={"path": "/about", "pageBlueprint": _doc(title="rev1"), "expectedRevision": 0},
            )
            assert resp.status_code == 201, resp.text

            # rev2 with missing deps (should block rollback target)
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/draft?token={token}",
                json={
                    "path": "/about",
                    "pageBlueprint": _doc(title="rev2"),
                    "deps": {"assetIds": [missing_asset_id]},
                    "expectedRevision": 1,
                },
            )
            assert resp.status_code == 201, resp.text

            resp = await client.get(f"/api/v1/sites/{site_id}/pages?token={token}")
            assert resp.status_code == 200, resp.text
            items = resp.json()["data"]["items"]
            page_id = next((x["id"] for x in items if x.get("path") == "/about"), None)
            assert isinstance(page_id, str)

            resp = await client.post(
                f"/api/v1/sites/{site_id}/pages/{page_id}/revisions/rollback?token={token}",
                json={"target": "draft", "revision": 2},
            )
            assert resp.status_code == 409, resp.text
            assert resp.json()["error"] == "REVISION_DEPS_MISSING"
            assert missing_asset_id in (resp.json().get("meta", {}) or {}).get("missingAssets", [])
