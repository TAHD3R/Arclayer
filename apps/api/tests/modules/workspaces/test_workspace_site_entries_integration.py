from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.database.orm import verify_db_ready
from apps.api.core.registry import create_app
from apps.api.modules.auth.deps import get_current_user, get_current_user_id
from apps.api.modules.auth.repository import UserRepository
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.organization.models.user import User
from apps.api.modules.organization.repository import OrganizationRepository
from apps.api.modules.workspaces.models.workspace import Workspace

pytestmark = pytest.mark.integration


def _doc(title: str) -> dict:
    return {
        "version": 1,
        "meta": {"title": {"en-US": title}},
        "blocks": [{"id": "h1", "type": "heading", "props": {"level": 1, "text": {"en-US": title}}}],
    }


@pytest.mark.asyncio
async def test_workspace_site_entries_flow(prepared_db, integration_valkey_settings) -> None:
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
            # Ensure site exists for the workspace.
            site_res = await client.get(f"/api/v1/workspaces/{ws.id}/site")
            assert site_res.status_code == 200, site_res.text

            # Create an entry type.
            create_type_res = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/entry-types",
                json={
                    "code": "article",
                    "name": "Article",
                    "fieldsSchema": {
                        "title": {"type": "string", "required": True},
                        "excerpt": {"type": "string", "required": False},
                    },
                },
            )
            assert create_type_res.status_code == 201, create_type_res.text
            entry_type = create_type_res.json()["data"]
            assert entry_type["code"] == "article"

            # List entry types.
            list_type_res = await client.get(f"/api/v1/workspaces/{ws.id}/site/entry-types")
            assert list_type_res.status_code == 200, list_type_res.text
            assert list_type_res.json()["data"]["total"] >= 1

            # Create an entry.
            create_entry_res = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/entries",
                json={"entryTypeCode": "article", "slug": "hello-phase1"},
            )
            assert create_entry_res.status_code == 201, create_entry_res.text
            entry = create_entry_res.json()["data"]
            entry_id = entry["id"]

            # Save draft revision.
            save_draft_res = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/entries/draft",
                json={
                    "entryTypeCode": "article",
                    "slug": "hello-phase1",
                    "data": {"title": "Hello", "excerpt": "Phase 1"},
                    "document": _doc("Hello phase1"),
                    "expectedRevision": 0,
                },
            )
            assert save_draft_res.status_code == 201, save_draft_res.text
            assert save_draft_res.json()["data"]["revision"] == 1

            # Publish.
            publish_res = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/entries/publish",
                json={"entryTypeCode": "article", "slug": "hello-phase1"},
            )
            assert publish_res.status_code == 200, publish_res.text
            assert publish_res.json()["data"]["revision"] == 1

            # List entries with entry type filter.
            list_entries_res = await client.get(
                f"/api/v1/workspaces/{ws.id}/site/entries",
                params={"entryTypeCode": "article"},
            )
            assert list_entries_res.status_code == 200, list_entries_res.text
            rows = list_entries_res.json()["data"]["items"]
            row = next((item for item in rows if item["id"] == entry_id), None)
            assert row is not None
            assert row["draftRevision"] == 1
            assert row["publishedRevision"] == 1

            # Read published revision.
            published_rev_res = await client.get(
                f"/api/v1/workspaces/{ws.id}/site/entries/{entry_id}/revisions/published",
            )
            assert published_rev_res.status_code == 200, published_rev_res.text
            assert published_rev_res.json()["data"]["revision"] == 1

            # Unpublish.
            unpublish_res = await client.post(
                f"/api/v1/workspaces/{ws.id}/site/entries/unpublish",
                json={"entryTypeCode": "article", "slug": "hello-phase1"},
            )
            assert unpublish_res.status_code == 200, unpublish_res.text

            # Delete entry.
            delete_entry_res = await client.delete(f"/api/v1/workspaces/{ws.id}/site/entries/{entry_id}")
            assert delete_entry_res.status_code == 200, delete_entry_res.text

            # Delete entry type.
            delete_type_res = await client.delete(
                f"/api/v1/workspaces/{ws.id}/site/entry-types/{entry_type['id']}",
            )
            assert delete_type_res.status_code == 200, delete_type_res.text
