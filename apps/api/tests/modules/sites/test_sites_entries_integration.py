from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.common.utils.public_ids import encode_uuid
from apps.api.config import get_settings
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
        is_active=True,
        created_by_user_id=uuid4(),
    )
    return encode_uuid(site.id)


async def _create_preview_token(client: AsyncClient, *, site_id: str) -> str:
    resp = await client.post(f"/api/v1/sites/{site_id}/preview-tokens", json={"ttl_seconds": 600})
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]["token"]


async def test_entries_delete_requires_unpublish(prepared_db, integration_valkey_settings) -> None:
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

            # Create entry type
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entry-types?token={token}",
                json={"code": "blog_post", "name": "Blog Post", "fields_schema": None},
            )
            assert resp.status_code == 201, resp.text
            entry_type_id = resp.json()["data"]["id"]

            # Create entry
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries?token={token}",
                json={"entry_type_code": "blog_post", "slug": "hello"},
            )
            assert resp.status_code == 201, resp.text
            entry_id = resp.json()["data"]["id"]

            # Draft -> publish
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/draft?token={token}",
                json={
                    "entry_type_code": "blog_post",
                    "slug": "hello",
                    "pageBlueprint": None,
                    "data": None,
                    "expected_revision": 0,
                },
            )
            assert resp.status_code == 201, resp.text

            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/publish?token={token}",
                json={"entry_type_code": "blog_post", "slug": "hello", "revision": None},
            )
            assert resp.status_code == 200, resp.text

            # Deleting a published entry should fail.
            resp = await client.delete(f"/api/v1/sites/{site_id}/entries/{entry_id}?token={token}")
            assert resp.status_code == 409, resp.text
            assert resp.json()["error"] == "ENTRY_MUST_UNPUBLISH"

            # Unpublish then delete should succeed.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/unpublish?token={token}",
                json={"entry_type_code": "blog_post", "slug": "hello"},
            )
            assert resp.status_code == 200, resp.text

            resp = await client.delete(f"/api/v1/sites/{site_id}/entries/{entry_id}?token={token}")
            assert resp.status_code == 200, resp.text

            # Entry type is still in use unless the entry is deleted; after delete, it should be deletable.
            resp = await client.delete(f"/api/v1/sites/{site_id}/entry-types/{entry_type_id}?token={token}")
            assert resp.status_code == 200, resp.text


async def test_entry_unpublish_requires_published(prepared_db, integration_valkey_settings) -> None:
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

            resp = await client.post(
                f"/api/v1/sites/{site_id}/entry-types?token={token}",
                json={"code": "blog_post", "name": "Blog Post"},
            )
            assert resp.status_code == 201, resp.text

            # Create entry but do not publish.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries?token={token}",
                json={"entry_type_code": "blog_post", "slug": "hello"},
            )
            assert resp.status_code == 201, resp.text

            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries/unpublish?token={token}",
                json={"entry_type_code": "blog_post", "slug": "hello"},
            )
            assert resp.status_code == 409, resp.text
            assert resp.json()["error"] == "ENTRY_NOT_PUBLISHED"


async def test_entry_type_delete_conflicts_when_in_use(prepared_db, integration_valkey_settings) -> None:
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

            resp = await client.post(
                f"/api/v1/sites/{site_id}/entry-types?token={token}",
                json={"code": "blog_post", "name": "Blog Post"},
            )
            assert resp.status_code == 201, resp.text
            entry_type_id = resp.json()["data"]["id"]

            # Create an entry of this type.
            resp = await client.post(
                f"/api/v1/sites/{site_id}/entries?token={token}",
                json={"entry_type_code": "blog_post", "slug": "hello"},
            )
            assert resp.status_code == 201, resp.text

            resp = await client.delete(f"/api/v1/sites/{site_id}/entry-types/{entry_type_id}?token={token}")
            assert resp.status_code == 409, resp.text
            assert resp.json()["error"] == "ENTRY_TYPE_IN_USE"
