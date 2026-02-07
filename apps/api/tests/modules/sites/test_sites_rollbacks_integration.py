from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.common.utils.public_ids import encode_uuid
from apps.api.core.database.orm import verify_db_ready
from apps.api.core.registry import create_app
from apps.api.modules.organization.models.organization import Organization
from apps.api.modules.sites.models.site import SiteRecord
from apps.api.modules.workspaces.models.workspace import Workspace

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
        primary_host=f"{uuid4().hex[:8]}.example.test",
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
        "meta": {"title": {"en-US": title}},
        "blocks": [
            {
                "id": "h1",
                "type": "heading",
                "props": {"level": 1, "text": {"en-US": title}},
            }
        ],
    }


def _get_title_from_route_resolve(payload: dict) -> str | None:
    doc = payload.get("data", {}).get("document")
    if not isinstance(doc, dict):
        return None
    meta = doc.get("meta")
    if not isinstance(meta, dict):
        return None
    title = meta.get("title")
    if not isinstance(title, dict):
        return None
    val = title.get("en-US")
    return val if isinstance(val, str) else None


def _find_page_id_by_path(tree_nodes: list[dict], path: str) -> str | None:
    stack = list(tree_nodes)
    while stack:
        n = stack.pop()
        if not isinstance(n, dict):
            continue
        if n.get("path") == path and isinstance(n.get("id"), str):
            return n["id"]
        children = n.get("children")
        if isinstance(children, list):
            stack.extend(children)
    return None


async def test_page_rollback_draft_affects_preview_route_resolve(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        site_id = await _bootstrap_site()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _create_preview_token(client, site_id=site_id)

            # Create draft revisions for "/about": rev1 -> rev2.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/draft?token={token}",
                json={"path": "/about", "document": _doc(title="rev1"), "expectedRevision": 0},
            )
            assert resp.status_code == 201, resp.text
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/draft?token={token}",
                json={"path": "/about", "document": _doc(title="rev2"), "expectedRevision": 1},
            )
            assert resp.status_code == 201, resp.text

            # Discover pageId via tree API.
            resp = await client.get(f"/api/v1/sites/{site_id}/pages?token={token}")
            assert resp.status_code == 200, resp.text
            tree = resp.json()["data"]["items"]
            page_id = _find_page_id_by_path(tree, "/about")
            assert page_id is not None

            # Rollback draft pointer to rev1.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/pages/{page_id}/revisions/rollback?token={token}",
                json={"target": "draft", "revision": 1},
            )
            assert resp.status_code == 200, resp.text
            out = resp.json()["data"]
            assert out["target"] == "draft"
            assert out["toRevision"] == 1

            # Preview resolve should now render rev1 again.
            resp = await client.get(f"/api/v1/sites/{site_id}/routes/resolve?path=%2Fabout&mode=preview&token={token}")
            assert resp.status_code == 200, resp.text
            assert _get_title_from_route_resolve(resp.json()) == "rev1"


async def test_page_rollback_published_affects_public_route_resolve(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        site_id = await _bootstrap_site()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _create_preview_token(client, site_id=site_id)

            # rev1 -> rev2, publish rev2, create rev3 draft.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/draft?token={token}",
                json={"path": "/about", "document": _doc(title="rev1"), "expectedRevision": 0},
            )
            assert resp.status_code == 201, resp.text
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/draft?token={token}",
                json={"path": "/about", "document": _doc(title="rev2"), "expectedRevision": 1},
            )
            assert resp.status_code == 201, resp.text
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/publish?token={token}",
                json={"path": "/about", "revision": 2},
            )
            assert resp.status_code == 200, resp.text
            resp = await client.post(
                f"/api/v1/sites/{site_id}/routes/draft?token={token}",
                json={"path": "/about", "document": _doc(title="rev3"), "expectedRevision": 2},
            )
            assert resp.status_code == 201, resp.text

            resp = await client.get(f"/api/v1/sites/{site_id}/pages?token={token}")
            assert resp.status_code == 200, resp.text
            tree = resp.json()["data"]["items"]
            page_id = _find_page_id_by_path(tree, "/about")
            assert page_id is not None

            # Rollback published pointer to rev1.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/pages/{page_id}/revisions/rollback?token={token}",
                json={"target": "published", "revision": 1},
            )
            assert resp.status_code == 200, resp.text
            assert resp.json()["data"]["toRevision"] == 1

            resp = await client.get(f"/api/v1/sites/{site_id}/routes/resolve?path=%2Fabout&mode=public")
            assert resp.status_code == 200, resp.text
            assert _get_title_from_route_resolve(resp.json()) == "rev1"


async def test_entry_rollback_published_affects_public_route_resolve(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        site_id = await _bootstrap_site()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _create_preview_token(client, site_id=site_id)

            # EntryType + RouteTemplate: /blog/:slug -> blog_post
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entry-types?token={token}",
                json={"code": "blog_post", "name": "Blog Post"},
            )
            assert resp.status_code == 201, resp.text

            resp = await client.post(
                f"/api/v1/sites/{site_id}/route-templates?token={token}",
                json={"pathPattern": "/blog/:slug", "entryTypeCode": "blog_post", "templatePageRevisionId": None},
            )
            assert resp.status_code == 201, resp.text

            # Create entry + rev1 -> rev2 publish -> rev3 draft.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries?token={token}",
                json={"entryTypeCode": "blog_post", "slug": "hello"},
            )
            assert resp.status_code == 201, resp.text
            entry_id = resp.json()["data"]["id"]

            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/draft?token={token}",
                json={
                    "entryTypeCode": "blog_post",
                    "slug": "hello",
                    "document": _doc(title="rev1"),
                    "data": None,
                    "expectedRevision": 0,
                },
            )
            assert resp.status_code == 201, resp.text
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/draft?token={token}",
                json={
                    "entryTypeCode": "blog_post",
                    "slug": "hello",
                    "document": _doc(title="rev2"),
                    "data": None,
                    "expectedRevision": 1,
                },
            )
            assert resp.status_code == 201, resp.text
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/publish?token={token}",
                json={"entryTypeCode": "blog_post", "slug": "hello", "revision": 2},
            )
            assert resp.status_code == 200, resp.text
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/draft?token={token}",
                json={
                    "entryTypeCode": "blog_post",
                    "slug": "hello",
                    "document": _doc(title="rev3"),
                    "data": None,
                    "expectedRevision": 2,
                },
            )
            assert resp.status_code == 201, resp.text

            # Rollback published to rev1.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/{entry_id}/revisions/rollback?token={token}",
                json={"target": "published", "revision": 1},
            )
            assert resp.status_code == 200, resp.text
            assert resp.json()["data"]["toRevision"] == 1

            resp = await client.get(f"/api/v1/sites/{site_id}/routes/resolve?path=%2Fblog%2Fhello&mode=public")
            assert resp.status_code == 200, resp.text
            assert _get_title_from_route_resolve(resp.json()) == "rev1"
