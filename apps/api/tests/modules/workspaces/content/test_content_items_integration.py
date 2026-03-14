from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import decode_public_id, encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.presentation_document import PresentationDocumentRecord
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.user import User
from apps.api.src.models.workspaces.workspace import Workspace
from apps.api.src.modules.auth.http.service import get_current_user, get_current_user_id
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


@asynccontextmanager
async def _workspace_client(prepared_db, integration_valkey_settings):
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
        workspace = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )
        workspace_id = encode_uuid(workspace.id)

        async def _get_user() -> User:
            return owner

        async def _get_user_id() -> UUID:
            return owner.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            site_res = await client.get(f"/api/v1/workspaces/{workspace_id}/site")
            assert site_res.status_code == 200, site_res.text
            yield client, workspace_id

        app.dependency_overrides.clear()


def _model_payload() -> dict:
    return {
        "key": "article",
        "name": "Article",
        "fields": [
            {"key": "title", "label": "Title", "scalar": "text", "required": True},
            {"key": "body", "label": "Body", "scalar": "long_text", "required": False},
        ],
        "relations": [],
        "capabilities": ["versioned", "publishable", "rich_text_editable", "visual_editable"],
        "routing": {"mode": "none"},
        "workflow": {"states": ["draft", "published"], "initialState": "draft"},
        "views": [],
    }


def _item_payload(*, status: str = "draft") -> dict:
    return {
        "modelKey": "article",
        "slug": "hello-world",
        "title": "Hello World",
        "locale": "en-US",
        "visibility": "public",
        "status": status,
    }


def _draft_payload() -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": "initial draft",
        "fieldsSnapshot": {
            "title": "Hello World",
            "body": "Draft body",
        },
        "presentations": [
            {"kind": "form_data", "payload": {"title": "Hello World", "body": "Draft body"}},
            {"kind": "rich_text_document", "payload": {"type": "doc", "content": []}},
            {"kind": "visual_blueprint", "payload": {"root": "page", "nodes": {}}},
        ],
    }


def _published_write_payload() -> dict:
    return {
        "changeSummary": "illegal published mutation",
        "fieldsSnapshot": {"title": "Should be rejected"},
        "presentations": [],
    }


@pytest.mark.asyncio
async def test_content_items_full_workflow_with_first_class_presentations(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text
        item_uuid = decode_public_id(item_id)
        await ContentVersionRecord.filter(item_id=item_uuid, version=1).update(last_transition_by_user_id=None)

        schedule_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/schedule",
            json={},
        )
        assert schedule_res.status_code == 200, schedule_res.text
        assert schedule_res.json()["data"]["state"] == "scheduled"
        scheduled_row = await ContentVersionRecord.filter(item_id=item_uuid, version=1).first()
        assert scheduled_row is not None
        assert scheduled_row.last_transition_by_user_id is not None
        await ContentVersionRecord.filter(item_id=item_uuid, version=1).update(last_transition_by_user_id=None)

        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text
        assert publish_res.json()["data"]["state"] == "published"

        version_row = await ContentVersionRecord.filter(item_id=item_uuid, version=1).first()
        assert version_row is not None
        assert version_row.last_transition_by_user_id is not None

        docs = await PresentationDocumentRecord.filter(version_id=version_row.id).order_by("kind")
        assert [doc.kind for doc in docs] == ["form_data", "rich_text_document", "visual_blueprint"]


@pytest.mark.asyncio
async def test_content_items_list_is_available_from_canonical_read_endpoint(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text

        list_res = await client.get(f"/api/v1/workspaces/{workspace_id}/content/items")
        assert list_res.status_code == 200, list_res.text
        payload = list_res.json()["data"]
        assert payload["total"] == 1
        assert payload["items"][0]["modelKey"] == "article"
        assert payload["items"][0]["slug"] == "hello-world"


@pytest.mark.asyncio
async def test_content_items_reject_direct_writes_to_published_version(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text

        patch_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1",
            json=_published_write_payload(),
        )
        assert patch_res.status_code == 409, patch_res.text
        assert patch_res.json()["error"] == "CONTENT_VERSION_IMMUTABLE"
        assert patch_res.json()["message"] == "Non-draft version is immutable"


@pytest.mark.asyncio
async def test_content_items_archive_transition_is_explicit_and_terminal_for_publish(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text
        assert publish_res.json()["data"]["state"] == "published"

        archive_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/archive",
            json={},
        )
        assert archive_res.status_code == 200, archive_res.text
        assert archive_res.json()["data"]["state"] == "archived"

        republish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert republish_res.status_code == 409, republish_res.text
        assert republish_res.json()["error"] == "CONTENT_VERSION_TRANSITION_INVALID"

        item_uuid = decode_public_id(item_id)
        archived_version = await ContentVersionRecord.filter(item_id=item_uuid, version=1).first()
        assert archived_version is not None
        assert archived_version.last_transition_by_user_id is not None


@pytest.mark.asyncio
async def test_content_items_reject_non_draft_initial_status(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        archived_item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(status="archived"),
        )
        assert archived_item_res.status_code == 409, archived_item_res.text
        assert archived_item_res.json()["error"] == "CONTENT_ITEM_STATUS_INVALID"

        published_item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(status="published"),
        )
        assert published_item_res.status_code == 409, published_item_res.text
        assert published_item_res.json()["error"] == "CONTENT_ITEM_STATUS_INVALID"
