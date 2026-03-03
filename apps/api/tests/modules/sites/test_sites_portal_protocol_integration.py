from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from tortoise import Tortoise

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import close_orm, init_orm
from apps.api.src.core.registry import create_app
from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.src.modules.organization.models.organization import Organization
from apps.api.src.modules.organization.models.user import User, UserCredential, UserStatus
from apps.api.src.modules.sites.models.site import SiteRecord
from apps.api.src.modules.sites.models.site_entry import EntryRecord, EntryRevisionRecord, EntryTypeRecord
from apps.api.src.modules.sites.models.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.src.modules.sites.models.site_route_template import RouteTemplateRecord
from apps.api.src.modules.system.models.setting import SettingRecord
from apps.api.src.modules.workspaces.models.workspace import Workspace
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.scopes import SCOPE_TYPE_SITE, SCOPE_TYPE_WORKSPACE
from apps.api.tests.utils.tortoise import reset_postgres_schema

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def prepared_schema(integration_db_settings, integration_valkey_settings, monkeypatch) -> None:
    """
    Prepare DB schema for integration tests.

    Note:
    - We disable plugin system to keep the test focused on Portal/Sites protocol.
    - Schema is created via `Tortoise.generate_schemas()` (test-only), not Aerich.
    """

    _ = integration_valkey_settings
    monkeypatch.setenv("PLUGIN__ENABLED", "0")
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "0")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    monkeypatch.setenv("SETUP__ENABLED", "0")
    get_settings.cache_clear()

    settings = get_settings()
    await init_orm(settings)
    await reset_postgres_schema()
    await Tortoise.generate_schemas(safe=True)
    await close_orm()


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
    doc = payload.get("data", {}).get("pageBlueprint")
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
    v = title.get("en-US")
    return v if isinstance(v, str) else None


async def test_sites_public_preview_draft_publish_flow(prepared_schema) -> None:
    _ = prepared_schema

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        # Arrange tenant + site.
        user = await User.create(username=f"u_{uuid4().hex[:10]}", status=UserStatus.ACTIVE)
        await UserCredential.create(user_id=user.id, password_hash="x")
        org = await Organization.create(slug=f"org_{uuid4().hex[:10]}", name="Test Org", logo_url=None, is_active=True)
        await OrgMembership.create(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug="ws",
            name="Workspace",
            is_active=True,
            created_by_user_id=user.id,
        )

        # Ensure deterministic sitemap base URL in self-host mode.
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=ws.id,
            namespace=CORE_SETTINGS_NAMESPACE,
            value={"site": {"url": "https://example.test"}},
            updated_by=None,
        )

        site = await SiteRecord.create(
            workspace_id=ws.id,
            slug="demo",
            name="Demo",
            default_locale="zh-CN",
            fallback_locale="en-US",
            is_active=True,
            created_by_user_id=user.id,
        )
        site_pid = encode_uuid(site.id)

        # DB-backed runtime config should override defaults.
        await SettingRecord.create(
            scope_type=SCOPE_TYPE_SITE,
            scope_id=site.id,
            namespace="site.runtime",
            value={
                "theme": {"cssVars": {"--color-primary": "#ff0000"}},
                "fonts": [],
            },
            updated_by=None,
        )

        # Static page (/about) with published rev=1.
        about = await SitePageRecord.create(
            site_id=site.id,
            path="/about",
            parent_id=None,
            sort_order=0,
            visibility=SitePageVisibility.PUBLIC,
            draft_rev=1,
            published_rev=1,
            created_by_user_id=user.id,
        )
        await SitePageRevisionRecord.create(
            page_id=about.id,
            rev=1,
            document=None,
            design_document=_design_doc("About v1"),
            created_by_user_id=user.id,
        )

        # Static page for /blog/hello (to test static priority over template match).
        blog_hello = await SitePageRecord.create(
            site_id=site.id,
            path="/blog/hello",
            parent_id=None,
            sort_order=0,
            visibility=SitePageVisibility.PUBLIC,
            draft_rev=1,
            published_rev=1,
            created_by_user_id=user.id,
        )
        await SitePageRevisionRecord.create(
            page_id=blog_hello.id,
            rev=1,
            document=None,
            design_document=_design_doc("Static /blog/hello"),
            created_by_user_id=user.id,
        )

        # Entry type + entry + published revision.
        et = await EntryTypeRecord.create(site_id=site.id, code="blog_post", name="Blog Post", fields_schema=None)
        entry = await EntryRecord.create(
            site_id=site.id,
            entry_type_id=et.id,
            slug="hello",
            draft_rev=1,
            published_rev=1,
            created_by_user_id=user.id,
        )
        await EntryRevisionRecord.create(
            entry_id=entry.id,
            rev=1,
            data=None,
            document=None,
            design_document=_design_doc("Entry /blog/:slug hello"),
            created_by_user_id=user.id,
        )

        # Another published entry (no static page) to validate sitemap includes dynamic entries.
        entry2 = await EntryRecord.create(
            site_id=site.id,
            entry_type_id=et.id,
            slug="world",
            draft_rev=1,
            published_rev=1,
            created_by_user_id=user.id,
        )
        await EntryRevisionRecord.create(
            entry_id=entry2.id,
            rev=1,
            data={"title": "World From Data"},
            document=None,
            design_document=_design_doc("Entry /blog/:slug world"),
            created_by_user_id=user.id,
        )

        # Route template /blog/:slug -> blog_post
        await RouteTemplateRecord.create(
            site_id=site.id,
            path_pattern="/blog/:slug",
            entry_type_id=et.id,
            template_page_revision_id=None,
            is_active=True,
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/sites/resolve", params={"workspaceSlug": "ws"})
            assert resp.status_code == 200
            assert resp.json()["data"]["siteId"] == site_pid

            resp = await client.get(f"/api/v1/sites/{site_pid}/runtime", params={"mode": "public"})
            assert resp.status_code == 200
            assert resp.json()["data"]["theme"]["cssVars"]["--color-primary"] == "#ff0000"

            # Preview token required for preview runtime.
            resp = await client.get(f"/api/v1/sites/{site_pid}/runtime", params={"mode": "preview"})
            assert resp.status_code == 403

            # Issue preview token (stored in Valkey with TTL).
            resp = await client.post(f"/api/v1/sites/{site_pid}/preview-tokens", json={"ttlSeconds": 600})
            assert resp.status_code == 201
            token = resp.json()["data"]["token"]
            assert isinstance(token, str) and token

            # Entry draft + publish flow (v1).
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/entries/draft",
                params={"token": token},
                json={
                    "entryTypeCode": "blog_post",
                    "slug": "world",
                    "pageBlueprint": _design_doc("Entry world v2 (draft)"),
                    "expectedRevision": 1,
                },
            )
            assert resp.status_code == 201
            assert resp.json()["data"]["revision"] == 2

            resp = await client.post(
                f"/api/v1/sites/{site_pid}/entries/publish",
                params={"token": token},
                json={"entryTypeCode": "blog_post", "slug": "world", "revision": 2},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 2

            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/blog/world", "mode": "public"},
            )
            assert resp.status_code == 200
            assert _get_seo_title_from_resolved_document(resp.json()) == "Entry world v2 (draft)"
            ds = resp.json()["data"].get("dataSources") or {}
            assert ds.get("primaryEntry", {}).get("data", {}).get("fields", {}).get("title") == "World From Data"

            # Creating a new entry from scratch should allow expectedRevision=0.
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/entries/draft",
                params={"token": token},
                json={
                    "entryTypeCode": "blog_post",
                    "slug": "new",
                    "pageBlueprint": _design_doc("Entry new v1 (draft)"),
                    "expectedRevision": 0,
                },
            )
            assert resp.status_code == 201
            assert resp.json()["data"]["revision"] == 1

            # Wrong expectedRevision should return 409 conflict.
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/entries/draft",
                params={"token": token},
                json={
                    "entryTypeCode": "blog_post",
                    "slug": "new",
                    "pageBlueprint": _design_doc("Entry new v2 (draft)"),
                    "expectedRevision": 0,
                },
            )
            assert resp.status_code == 409

            resp = await client.post(
                f"/api/v1/sites/{site_pid}/entries/publish",
                params={"token": token},
                json={"entryTypeCode": "blog_post", "slug": "new", "revision": 1},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 1

            # Publishing an unknown slug should return 404.
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/entries/publish",
                params={"token": token},
                json={"entryTypeCode": "blog_post", "slug": "missing", "revision": 1},
            )
            assert resp.status_code == 404

            # Unknown entry type should return 404.
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/entries/draft",
                params={"token": token},
                json={
                    "entryTypeCode": "missing_type",
                    "slug": "x",
                    "pageBlueprint": _design_doc("Entry x"),
                    "expectedRevision": 0,
                },
            )
            assert resp.status_code == 404

            # Public sitemap should include published + public pages and entries.
            resp = await client.get(f"/api/v1/sites/{site_pid}/sitemap.xml")
            assert resp.status_code == 200
            xml = resp.text
            assert "https://example.test/about" in xml
            assert "https://example.test/blog/hello" in xml  # static page
            assert "https://example.test/blog/world" in xml  # dynamic entry (no static override)

            # Page revisions: published is public, draft requires token.
            resp = await client.get(f"/api/v1/sites/{site_pid}/pages/{encode_uuid(about.id)}/revisions/published")
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 1
            assert _get_seo_title_from_resolved_document(resp.json()) == "About v1"

            resp = await client.get(
                f"/api/v1/sites/{site_pid}/pages/{encode_uuid(about.id)}/revisions/draft",
                params={"token": token},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 1

            # Static route should win over template match (/blog/hello).
            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/blog/hello", "mode": "public"},
            )
            assert resp.status_code == 200
            payload = resp.json()["data"]
            assert payload["match"]["kind"] == "page"
            assert _get_seo_title_from_resolved_document(resp.json()) == "Static /blog/hello"

            # Save a draft for /about (rev=2).
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/routes/draft",
                params={"token": token},
                json={"path": "/about", "pageBlueprint": _design_doc("About v2 (draft)"), "expectedRevision": 1},
            )
            assert resp.status_code == 201
            assert resp.json()["data"]["revision"] == 2

            resp = await client.get(
                f"/api/v1/sites/{site_pid}/pages/{encode_uuid(about.id)}/revisions/draft",
                params={"token": token},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 2
            assert _get_seo_title_from_resolved_document(resp.json()) == "About v2 (draft)"

            # Public mode still sees published v1.
            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert resp.status_code == 200
            assert _get_seo_title_from_resolved_document(resp.json()) == "About v1"

            # Preview mode sees latest draft v2.
            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/about", "mode": "preview", "token": token},
            )
            assert resp.status_code == 200
            assert _get_seo_title_from_resolved_document(resp.json()) == "About v2 (draft)"

            # Publishing makes v2 visible to public.
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/routes/publish",
                params={"token": token},
                json={"path": "/about", "revision": 2},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 2

            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert resp.status_code == 200
            assert _get_seo_title_from_resolved_document(resp.json()) == "About v2 (draft)"

            resp = await client.get(f"/api/v1/sites/{site_pid}/pages/{encode_uuid(about.id)}/revisions/published")
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 2

            # Optimistic lock mismatch -> 409 Conflict.
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/routes/draft",
                params={"token": token},
                json={"path": "/about", "pageBlueprint": _design_doc("About v3"), "expectedRevision": 1},
            )
            assert resp.status_code == 409

            # Preferred editor entrypoints: save/publish by pageId.
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/pages/{encode_uuid(about.id)}/revisions/draft",
                params={"token": token},
                json={
                    "pageBlueprint": _design_doc("About v3 (draft by id)"),
                    "expectedRevision": 2,
                },
            )
            assert resp.status_code == 201
            assert resp.json()["data"]["pageId"] == encode_uuid(about.id)
            assert resp.json()["data"]["revision"] == 3

            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/about", "mode": "preview", "token": token},
            )
            assert resp.status_code == 200
            assert _get_seo_title_from_resolved_document(resp.json()) == "About v3 (draft by id)"

            resp = await client.post(
                f"/api/v1/sites/{site_pid}/pages/{encode_uuid(about.id)}/revisions/publish",
                params={"token": token},
                json={"revision": 3},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 3

            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert resp.status_code == 200
            assert _get_seo_title_from_resolved_document(resp.json()) == "About v3 (draft by id)"

            # Entry revisions: ensure published snapshot is accessible.
            resp = await client.get(f"/api/v1/sites/{site_pid}/entries/{encode_uuid(entry.id)}/revisions/published")
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 1
            assert _get_seo_title_from_resolved_document(resp.json()) == "Entry /blog/:slug hello"
