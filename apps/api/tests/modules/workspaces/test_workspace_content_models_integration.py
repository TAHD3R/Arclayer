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


@pytest.mark.asyncio
async def test_workspace_content_models_list_maps_legacy_types_to_model_contracts(
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

            page_type_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/types",
                json={"code": "page", "name": "Page", "kind": "page"},
            )
            assert page_type_res.status_code == 201, page_type_res.text

            post_type_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/types",
                json={"code": "article", "name": "Article", "kind": "post"},
            )
            assert post_type_res.status_code == 201, post_type_res.text

            models_res = await client.get(f"/api/v1/workspaces/{ws_pid}/content/models")
            assert models_res.status_code == 200, models_res.text
            payload = models_res.json()["data"]
            assert payload["total"] >= 2

            page_model = next(item for item in payload["items"] if item["key"] == "page")
            article_model = next(item for item in payload["items"] if item["key"] == "article")

            assert "kind" not in page_model
            assert page_model["category"] == "site_builder"
            assert page_model["defaultEditor"] == "visual"
            assert {"versioned", "routable", "treeable", "visual_editable", "publishable"}.issubset(
                set(page_model["capabilities"])
            )

            assert "kind" not in article_model
            assert article_model["category"] == "content_library"
            assert article_model["defaultEditor"] == "rich_text"
            assert {"versioned", "routable", "rich_text_editable", "publishable"}.issubset(
                set(article_model["capabilities"])
            )


@pytest.mark.asyncio
async def test_workspace_content_models_list_preserves_explicit_model_contract_payload(
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

            create_res = await client.post(
                f"/api/v1/workspaces/{ws_pid}/content/types",
                json={
                    "code": "author",
                    "name": "Author",
                    "kind": "custom",
                    "fieldSchema": {
                        "version": 1,
                        "fields": [
                            {"key": "display_name", "type": "text"},
                            {"key": "bio", "type": "rich_text"},
                        ],
                    },
                    "editorSchema": {
                        "category": "content_library",
                        "description": "Profiles used across posts, layouts, and testimonials.",
                        "capabilities": [
                            "versioned",
                            "routable",
                            "has_relations",
                            "localizable",
                            "publishable",
                            "seo_managed",
                        ],
                        "defaultEditor": "form",
                        "relationSchema": {"avatar": {"target": "asset", "kind": "one"}},
                        "routingSchema": {"mode": "slug_only", "pattern": "/authors/:slug"},
                        "presentationSchema": {"allowed": ["form_data", "seo"]},
                        "viewSchema": {"defaultView": "table"},
                    },
                    "workflowPolicy": {"supportsSchedule": False},
                },
            )
            assert create_res.status_code == 201, create_res.text

            models_res = await client.get(f"/api/v1/workspaces/{ws_pid}/content/models")
            assert models_res.status_code == 200, models_res.text
            payload = models_res.json()["data"]

            author_model = next(item for item in payload["items"] if item["key"] == "author")
            assert author_model["category"] == "content_library"
            assert author_model["description"] == "Profiles used across posts, layouts, and testimonials."
            assert author_model["defaultEditor"] == "form"
            assert author_model["capabilities"] == [
                "versioned",
                "routable",
                "has_relations",
                "localizable",
                "publishable",
                "seo_managed",
            ]
            assert author_model["relationSchema"] == {"avatar": {"target": "asset", "kind": "one"}}
            assert author_model["routingSchema"] == {"mode": "slug_only", "pattern": "/authors/:slug"}
            assert author_model["presentationSchema"] == {"allowed": ["form_data", "seo"]}
            assert author_model["viewSchema"] == {"defaultView": "table"}
            assert author_model["workflowPolicy"] == {"supportsSchedule": False}
