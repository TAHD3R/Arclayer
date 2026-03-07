from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.user import User
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
                "children": [],
                "seo": {"title": {"en-US": title}},
            }
        },
    }


@pytest.mark.asyncio
async def test_workspace_content_items_and_versions_contracts(
    prepared_db,
    integration_valkey_settings,
) -> None:
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
        ws_pid = encode_uuid(ws.id)

        current_user: User | None = owner

        async def _get_user() -> User:
            assert current_user is not None
            return current_user

        async def _get_user_id() -> UUID:
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            site_res = await client.get(f"/api/v1/workspaces/{ws_pid}/site")
            assert site_res.status_code == 200, site_res.text

            type_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/types",
                json={"code": "article", "name": "Article", "kind": "post"},
            )
            assert type_res.status_code == 201, type_res.text

            entry_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries",
                json={"typeCode": "article", "slug": "hello-world", "title": "Hello"},
            )
            assert entry_res.status_code == 201, entry_res.text
            entry_id = entry_res.json()["data"]["id"]

            draft_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/draft",
                json={
                    "fieldValues": {"title": "Hello", "summary": "Item contract test"},
                    "pageBlueprint": _doc("Hello world"),
                    "expectedRevision": 0,
                },
            )
            assert draft_res.status_code == 201, draft_res.text

            publish_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/entries/{entry_id}/publish",
                json={},
            )
            assert publish_res.status_code == 200, publish_res.text

            items_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/content/items",
                params={"modelKey": "article"},
            )
            assert items_res.status_code == 200, items_res.text
            items_payload = items_res.json()["data"]
            assert items_payload["total"] >= 1

            item = next((row for row in items_payload["items"] if row["id"] == entry_id), None)
            assert item is not None
            assert item["modelKey"] == "article"
            assert "path" not in item
            assert "parentEntryId" not in item
            assert "pageBlueprint" not in item
            assert item["draftVersion"] == 1
            assert item["publishedVersion"] == 1

            item_res = await client.get(f"/api/v1/workspaces/{ws_pid}/content/items/{entry_id}")
            assert item_res.status_code == 200, item_res.text
            assert item_res.json()["data"]["id"] == entry_id

            draft_version_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/content/items/{entry_id}/versions/draft",
            )
            assert draft_version_res.status_code == 200, draft_version_res.text
            draft_version = draft_version_res.json()["data"]
            assert draft_version["itemId"] == entry_id
            assert draft_version["versionNumber"] == 1
            assert draft_version["state"] == "draft"
            assert {"form_data", "visual_blueprint"}.issubset({item["kind"] for item in draft_version["presentations"]})

            published_version_res = await client.get(
                f"/api/v1/workspaces/{ws_pid}/content/items/{entry_id}/versions/published",
            )
            assert published_version_res.status_code == 200, published_version_res.text
            published_version = published_version_res.json()["data"]
            assert published_version["versionNumber"] == 1
            assert published_version["state"] == "published"
