from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import decode_public_id
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.models.content.route import ContentRouteRecord
from apps.api.src.models.content.tree import ContentTreeNodeRecord
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.workspaces.workspace import Workspace
from apps.api.src.modules.auth.http.service import get_current_user, get_current_user_id
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


def _doc(title: str) -> dict:
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


@pytest.mark.asyncio
async def test_workspace_content_route_tree_management_endpoints(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        settings = get_settings()
        await verify_db_ready(settings)

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash="x",
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )

        async def _get_user_id() -> UUID:
            return owner.id

        async def _get_user():
            return owner

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # Resolve workspace site (auto-create if missing).
            res = await client.get(f"/api/v1/workspaces/{ws.id}/site")
            assert res.status_code == 200, res.text
            site_payload = res.json()["data"]
            site_id = site_payload["siteId"]
            assert isinstance(site_id, str) and site_id

            # Create two pages (these will dual-write ContentRoute + ContentTree nodes).
            res_about = await client.post(
                f"/api/v1/workspaces/{ws.id}/content/pages",
                json={"path": "/about", "title": "About"},
            )
            assert res_about.status_code == 201, res_about.text
            about_page = res_about.json()["data"]
            about_id = about_page["id"]

            res_team = await client.post(
                f"/api/v1/workspaces/{ws.id}/content/pages",
                json={"path": "/team", "title": "Team"},
            )
            assert res_team.status_code == 201, res_team.text
            team_page = res_team.json()["data"]
            team_id = team_page["id"]

            # Save draft revisions so both pages can be published and resolved in public mode.
            for pid, title in [(about_id, "About v1"), (team_id, "Team v1")]:
                res_draft = await client.post(
                    f"/api/v1/workspaces/{ws.id}/content/pages/{pid}/revisions/draft",
                    json={"pageBlueprint": _doc(title), "expectedRevision": 0},
                )
                assert res_draft.status_code == 201, res_draft.text
                res_pub = await client.post(
                    f"/api/v1/workspaces/{ws.id}/content/pages/{pid}/revisions/publish",
                    json={},
                )
                assert res_pub.status_code == 200, res_pub.text

            # List route bindings and locate the Team route record.
            res_routes = await client.get(f"/api/v1/workspaces/{ws.id}/content/routes")
            assert res_routes.status_code == 200, res_routes.text
            routes = res_routes.json()["data"]["items"]
            assert isinstance(routes, list) and routes
            team_route = next((row for row in routes if row.get("entryId") == team_id), None)
            assert team_route is not None
            team_route_id = team_route["id"]
            assert team_route["path"] == "/team"

            # Patch the Team route binding path.
            res_patch = await client.patch(
                f"/api/v1/workspaces/{ws.id}/content/routes/{team_route_id}",
                json={"path": "/our-team"},
            )
            assert res_patch.status_code == 200, res_patch.text
            assert res_patch.json()["data"]["path"] == "/our-team"

            site_uuid = decode_public_id(site_id)
            team_uuid = decode_public_id(team_id)
            route = await ContentRouteRecord.get_or_none(site_id=site_uuid, entry_id=team_uuid)
            assert route is not None
            assert route.path == "/our-team"

            # Public mode should resolve the page using the new path.
            res_resolve = await client.get(
                f"/api/v1/sites/{site_id}/routes/resolve",
                params={"path": "/our-team", "mode": "public"},
            )
            assert res_resolve.status_code == 200, res_resolve.text
            assert res_resolve.json()["data"]["match"]["kind"] == "page"

            # Upsert tree node: move Team under About.
            res_tree_upsert = await client.put(
                f"/api/v1/workspaces/{ws.id}/content/tree-nodes/{team_id}",
                json={"parentEntryId": about_id, "sortOrder": 3},
            )
            assert res_tree_upsert.status_code == 200, res_tree_upsert.text
            assert res_tree_upsert.json()["data"]["parentEntryId"] == about_id

            about_uuid = decode_public_id(about_id)
            node = await ContentTreeNodeRecord.get_or_none(site_id=site_uuid, entry_id=team_uuid)
            assert node is not None
            assert node.parent_entry_id == about_uuid

            # Pages tree should reflect new parent relationship and updated route.
            res_pages_tree = await client.get(f"/api/v1/workspaces/{ws.id}/content/pages/tree")
            assert res_pages_tree.status_code == 200, res_pages_tree.text
            items = res_pages_tree.json()["data"]["items"]
            about_node = next((row for row in items if row.get("id") == about_id), None)
            assert about_node is not None
            child_paths = {child.get("path") for child in about_node.get("children", [])}
            assert "/our-team" in child_paths
