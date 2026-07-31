from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.organization.repository import OrganizationRepository
from tests.utils.project_context import project_id_for_workspace

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_project_content_models_list_maps_legacy_types_to_model_contracts(
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
            name="Workspace",
            is_active=True,
            owner_user_id=owner.id,
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
            project_id = await project_id_for_workspace(client, ws_pid)
            site_res = await client.get(f"/api/v1/projects/{project_id}/site")
            assert site_res.status_code == 200, site_res.text

            page_model_res = await client.post(
                f"/api/v1/projects/{project_id}/content/models",
                json={
                    "singularKey": "page",
                    "pluralKey": "pages",
                    "name": "Page",
                    "fields": [
                        {"key": "hero_variant", "label": "Hero Variant", "scalar": "text", "required": False},
                    ],
                },
            )
            assert page_model_res.status_code == 201, page_model_res.text

            article_model_res = await client.post(
                f"/api/v1/projects/{project_id}/content/models",
                json={
                    "singularKey": "article",
                    "pluralKey": "articles",
                    "name": "Article",
                    "fields": [
                        {"key": "reading_time_minutes", "label": "Reading Time", "scalar": "number", "required": False},
                    ],
                },
            )
            assert article_model_res.status_code == 201, article_model_res.text

            models_res = await client.get(f"/api/v1/projects/{project_id}/content/models")
            assert models_res.status_code == 200, models_res.text
            payload = models_res.json()["data"]
            assert payload["total"] >= 2

            page_model = next(item for item in payload["items"] if item["singularKey"] == "page")
            article_model = next(item for item in payload["items"] if item["singularKey"] == "article")

            assert "kind" not in page_model
            assert page_model["protocolKey"] == "page"
            assert page_model["systemManaged"] is True
            assert page_model["category"] == "site_builder"
            assert page_model["defaultEditor"] == "visual"
            assert page_model["routingSchema"]["slug_field"] == "path"
            assert page_model["workflowPolicy"]["initial_state"] == "draft"
            assert page_model["fieldSchema"]["title"]["scalar"] == "text"
            assert page_model["fieldSchema"]["hero_variant"]["scalar"] == "text"
            assert {"versioned", "routable", "treeable", "visual_editable", "publishable"}.issubset(
                set(page_model["capabilities"])
            )

            assert "kind" not in article_model
            assert article_model["protocolKey"] == "article"
            assert article_model["systemManaged"] is True
            assert article_model["category"] == "content_library"
            assert article_model["defaultEditor"] == "rich_text"
            assert article_model["routingSchema"]["mode"] == "none"
            assert article_model["workflowPolicy"]["initial_state"] == "draft"
            assert article_model["fieldSchema"]["summary"]["scalar"] == "long_text"
            assert article_model["fieldSchema"]["reading_time_minutes"]["scalar"] == "number"
            assert {"versioned", "rich_text_editable", "publishable"}.issubset(set(article_model["capabilities"]))


@pytest.mark.asyncio
async def test_project_content_models_create_custom_model_with_dual_identifiers(
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
            name="Workspace",
            is_active=True,
            owner_user_id=owner.id,
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
            project_id = await project_id_for_workspace(client, ws_pid)
            site_res = await client.get(f"/api/v1/projects/{project_id}/site")
            assert site_res.status_code == 200, site_res.text

            create_res = await client.post(
                f"/api/v1/projects/{project_id}/content/models",
                json={
                    "singularKey": "blogPost",
                    "pluralKey": "blogPosts",
                    "name": "Blog Post",
                    "description": "Editorial profile records.",
                    "modelKind": "collection_type",
                    "fields": [],
                    "relations": [],
                    "capabilities": ["queryable"],
                    "routing": {"mode": "none"},
                    "workflow": {"states": ["draft"], "initialState": "draft"},
                    "views": [],
                },
            )
            assert create_res.status_code == 201, create_res.text
            payload = create_res.json()["data"]
            assert payload["singularKey"] == "blogPost"
            assert payload["pluralKey"] == "blogPosts"
            assert payload["name"] == "Blog Post"
            assert payload["description"] == "Editorial profile records."
            assert payload["systemManaged"] is False
            assert "key" not in payload
