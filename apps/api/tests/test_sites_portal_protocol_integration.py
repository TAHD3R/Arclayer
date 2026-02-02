from __future__ import annotations

from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from tortoise import Tortoise

from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.infra.db.orm import close_orm, init_orm
from apps.api.models.org_membership import OrgMembership, OrgRole
from apps.api.models.organization import Organization
from apps.api.models.site import SiteRecord
from apps.api.models.site_entry import EntryRecord, EntryRevisionRecord, EntryTypeRecord
from apps.api.models.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.models.site_route_template import RouteTemplateRecord
from apps.api.models.user import User, UserCredential, UserStatus
from apps.api.models.workspace import Workspace
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


def _doc(title: str) -> dict:
    return {
        "version": 1,
        "meta": {"title": {"en-US": title}},
        "blocks": [{"id": "h1", "type": "heading", "props": {"level": 1, "text": {"en-US": title}}}],
    }


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

        site_id = UUID("00000000-0000-0000-0000-000000000001")
        site = await SiteRecord.create(
            id=site_id,
            workspace_id=ws.id,
            slug="demo",
            name="Demo",
            default_locale="zh-CN",
            fallback_locale="en-US",
            primary_host="example.test",
            is_active=True,
            created_by_user_id=user.id,
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
        await SitePageRevisionRecord.create(page_id=about.id, rev=1, document=_doc("About v1"), created_by_user_id=user.id)

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
            page_id=blog_hello.id, rev=1, document=_doc("Static /blog/hello"), created_by_user_id=user.id
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
            document=_doc("Entry /blog/:slug hello"),
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
            data=None,
            document=_doc("Entry /blog/:slug world"),
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
            # Host resolution strips the port.
            resp = await client.get("/api/v1/sites/resolve", params={"host": "example.test:3100"})
            assert resp.status_code == 200
            assert resp.json()["data"]["siteId"] == str(site.id)

            # Preview token required for preview runtime.
            resp = await client.get(f"/api/v1/sites/{site.id}/runtime", params={"mode": "preview"})
            assert resp.status_code == 403

            # Issue preview token (stored in Valkey with TTL).
            resp = await client.post(f"/api/v1/sites/{site.id}/preview-tokens", json={"ttlSeconds": 600})
            assert resp.status_code == 201
            token = resp.json()["data"]["token"]
            assert isinstance(token, str) and token

            # Public sitemap should include published + public pages and entries.
            resp = await client.get(f"/api/v1/sites/{site.id}/sitemap.xml")
            assert resp.status_code == 200
            xml = resp.text
            assert "https://example.test/about" in xml
            assert "https://example.test/blog/hello" in xml  # static page
            assert "https://example.test/blog/world" in xml  # dynamic entry (no static override)

            # Static route should win over template match (/blog/hello).
            resp = await client.get(
                f"/api/v1/sites/{site.id}/routes/resolve",
                params={"path": "/blog/hello", "mode": "public"},
            )
            assert resp.status_code == 200
            payload = resp.json()["data"]
            assert payload["match"]["kind"] == "page"
            assert payload["document"]["meta"]["title"]["en-US"] == "Static /blog/hello"

            # Save a draft for /about (rev=2).
            resp = await client.post(
                f"/api/v1/sites/{site.id}/routes/draft",
                params={"token": token},
                json={"path": "/about", "document": _doc("About v2 (draft)"), "expectedRevision": 1},
            )
            assert resp.status_code == 201
            assert resp.json()["data"]["revision"] == 2

            # Public mode still sees published v1.
            resp = await client.get(
                f"/api/v1/sites/{site.id}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["document"]["meta"]["title"]["en-US"] == "About v1"

            # Preview mode sees latest draft v2.
            resp = await client.get(
                f"/api/v1/sites/{site.id}/routes/resolve",
                params={"path": "/about", "mode": "preview", "token": token},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["document"]["meta"]["title"]["en-US"] == "About v2 (draft)"

            # Publishing makes v2 visible to public.
            resp = await client.post(
                f"/api/v1/sites/{site.id}/routes/publish",
                params={"token": token},
                json={"path": "/about", "revision": 2},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["revision"] == 2

            resp = await client.get(
                f"/api/v1/sites/{site.id}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["document"]["meta"]["title"]["en-US"] == "About v2 (draft)"

            # Optimistic lock mismatch -> 409 Conflict.
            resp = await client.post(
                f"/api/v1/sites/{site.id}/routes/draft",
                params={"token": token},
                json={"path": "/about", "document": _doc("About v3"), "expectedRevision": 1},
            )
            assert resp.status_code == 409
