from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from tortoise import Tortoise

from apps.api.common.utils.public_ids import encode_uuid
from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm
from apps.api.core.registry import create_app
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.organization.models.organization import Organization
from apps.api.modules.organization.models.user import User, UserCredential, UserStatus
from apps.api.modules.sites.models.site import SiteRecord
from apps.api.modules.sites.models.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.modules.workspaces.content.models.content import (
    ContentEntryRecord,
    ContentRevisionRecord,
    ContentTypeRecord,
)
from apps.api.modules.workspaces.models.workspace import Workspace
from apps.api.tests.utils.tortoise import reset_postgres_schema

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def prepared_schema(integration_db_settings, integration_valkey_settings, monkeypatch) -> None:
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


def _page_doc_with_ref(*, ref_entry_id: str, ref_state: str = "published") -> dict:
    return {
        "version": 1,
        "rootId": "page",
        "nodesById": {
            "page": {
                "id": "page",
                "type": "page_root",
                "name": "Page",
                "children": ["ref1"],
                "layout": {"children": {"mode": "absolute"}},
            },
            "ref1": {
                "id": "ref1",
                "type": "content_ref",
                "refEntryId": ref_entry_id,
                "refState": ref_state,
            },
        },
    }


async def test_sites_resolve_includes_for_content_ref(prepared_schema) -> None:
    _ = prepared_schema

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
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

        # Referenced component entry (header).
        ct = await ContentTypeRecord.create(
            workspace_id=ws.id,
            site_id=site.id,
            code="header_component",
            name="Header",
            kind="component",
        )
        header_entry = await ContentEntryRecord.create(
            workspace_id=ws.id,
            site_id=site.id,
            type_id=ct.id,
            slug="header",
            title="Header",
            status="published",
            visibility="public",
            locale="en-US",
            draft_revision=1,
            published_revision=1,
            created_by_user_id=user.id,
        )
        header_pid = encode_uuid(header_entry.id)
        await ContentRevisionRecord.create(
            entry_id=header_entry.id,
            revision=1,
            snapshot={
                "field_values": {"title": "Header"},
                "page_blueprint": _header_doc("Header v1"),
                "meta": {"kind": "component"},
            },
            created_by_user_id=user.id,
        )

        # Static page referencing the header entry.
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
            design_document=_page_doc_with_ref(ref_entry_id=header_pid),
            created_by_user_id=user.id,
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert resp.status_code == 200

            data = resp.json().get("data") or {}
            includes = data.get("includes") or {}
            include = includes.get(f"{header_pid}:published") or {}
            assert include.get("entryId") == header_pid
            assert include.get("resolvedState") == "published"
            assert include.get("pageBlueprint") is not None


async def test_sites_resolve_content_ref_state_forbidden_in_public(prepared_schema) -> None:
    _ = prepared_schema

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
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

        ct = await ContentTypeRecord.create(
            workspace_id=ws.id,
            site_id=site.id,
            code="component",
            name="Component",
            kind="component",
        )
        entry = await ContentEntryRecord.create(
            workspace_id=ws.id,
            site_id=site.id,
            type_id=ct.id,
            slug="x",
            title="X",
            status="published",
            visibility="public",
            locale="en-US",
            draft_revision=1,
            published_revision=1,
            created_by_user_id=user.id,
        )
        entry_pid = encode_uuid(entry.id)
        await ContentRevisionRecord.create(
            entry_id=entry.id,
            revision=1,
            snapshot={"field_values": {"title": "X"}, "page_blueprint": _header_doc("X v1"), "meta": {}},
            created_by_user_id=user.id,
        )

        page = await SitePageRecord.create(
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
            page_id=page.id,
            rev=1,
            document=None,
            design_document=_page_doc_with_ref(ref_entry_id=entry_pid, ref_state="draft"),
            created_by_user_id=user.id,
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert resp.status_code == 200

            data = resp.json().get("data") or {}
            includes = data.get("includes") or {}
            include = includes.get(f"{entry_pid}:published") or {}
            assert include.get("entryId") == entry_pid
            assert include.get("resolvedState") == "published"
            assert include.get("error", {}).get("code") == "STATE_FORBIDDEN"

            warnings = data.get("warnings") or []
            assert any(w.get("code") == "STATE_FORBIDDEN" for w in warnings)


async def test_sites_resolve_content_ref_cycle_detected(prepared_schema) -> None:
    _ = prepared_schema

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
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

        ct = await ContentTypeRecord.create(
            workspace_id=ws.id,
            site_id=site.id,
            code="component",
            name="Component",
            kind="component",
        )

        # Create A and B first so we can reference their public ids.
        entry_a = await ContentEntryRecord.create(
            workspace_id=ws.id,
            site_id=site.id,
            type_id=ct.id,
            slug="a",
            title="A",
            status="published",
            visibility="public",
            locale="en-US",
            draft_revision=1,
            published_revision=1,
            created_by_user_id=user.id,
        )
        entry_b = await ContentEntryRecord.create(
            workspace_id=ws.id,
            site_id=site.id,
            type_id=ct.id,
            slug="b",
            title="B",
            status="published",
            visibility="public",
            locale="en-US",
            draft_revision=1,
            published_revision=1,
            created_by_user_id=user.id,
        )

        pid_a = encode_uuid(entry_a.id)
        pid_b = encode_uuid(entry_b.id)

        doc_a = _page_doc_with_ref(ref_entry_id=pid_b, ref_state="published")
        doc_b = _page_doc_with_ref(ref_entry_id=pid_a, ref_state="published")

        await ContentRevisionRecord.create(
            entry_id=entry_a.id,
            revision=1,
            snapshot={"field_values": {"title": "A"}, "page_blueprint": doc_a, "meta": {}},
            created_by_user_id=user.id,
        )
        await ContentRevisionRecord.create(
            entry_id=entry_b.id,
            revision=1,
            snapshot={"field_values": {"title": "B"}, "page_blueprint": doc_b, "meta": {}},
            created_by_user_id=user.id,
        )

        page = await SitePageRecord.create(
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
            page_id=page.id,
            rev=1,
            document=None,
            design_document=_page_doc_with_ref(ref_entry_id=pid_a, ref_state="published"),
            created_by_user_id=user.id,
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                f"/api/v1/sites/{site_pid}/routes/resolve",
                params={"path": "/about", "mode": "public"},
            )
            assert resp.status_code == 200

            data = resp.json().get("data") or {}
            includes = data.get("includes") or {}

            include_a = includes.get(f"{pid_a}:published") or {}
            assert include_a.get("error", {}).get("code") == "CYCLE_DETECTED"

            warnings = data.get("warnings") or []
            assert any(w.get("code") == "CYCLE_DETECTED" for w in warnings)
