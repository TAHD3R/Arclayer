from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.organization.repository import OrganizationRepository
from tests.utils.project_context import project_id_for_workspace

pytestmark = pytest.mark.integration


async def _wait_latest_workspace_audit_event(
    *,
    event_name: str,
    workspace_id: UUID,
    entity_id: UUID | None = None,
    timeout_seconds: float = 3.0,
):
    from src.models.analytics.audit_event import AuditEvent

    deadline = asyncio.get_running_loop().time() + timeout_seconds
    while True:
        query = AuditEvent.filter(event_name=event_name, workspace_id=workspace_id)
        if entity_id is not None:
            query = query.filter(entity_id=entity_id)
        row = await query.order_by("-occurred_at", "-id").first()
        if row is not None:
            return row
        if asyncio.get_running_loop().time() >= deadline:
            recent = await AuditEvent.filter(workspace_id=workspace_id).order_by("-occurred_at", "-id").limit(10)
            recent_release_events = await (
                AuditEvent.filter(event_name__icontains="release").order_by("-occurred_at", "-id").limit(10)
            )
            snapshot = [
                {
                    "entity_id": str(item.entity_id) if item.entity_id is not None else None,
                    "event_name": item.event_name,
                    "organization_id": str(item.organization_id) if item.organization_id is not None else None,
                    "properties": item.properties,
                    "workspace_id": str(item.workspace_id) if item.workspace_id is not None else None,
                }
                for item in recent
            ]
            release_snapshot = [
                {
                    "entity_id": str(item.entity_id) if item.entity_id is not None else None,
                    "event_name": item.event_name,
                    "organization_id": str(item.organization_id) if item.organization_id is not None else None,
                    "properties": item.properties,
                    "workspace_id": str(item.workspace_id) if item.workspace_id is not None else None,
                }
                for item in recent_release_events
            ]
            raise AssertionError(
                f"expected audit event not found: {event_name}; workspace_id={workspace_id}; "
                f"entity_id={entity_id}; recent_workspace_events={snapshot}; "
                f"recent_release_events={release_snapshot}"
            )
        await asyncio.sleep(0.1)


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
            email=f"owner_{uuid4().hex[:10]}@example.com",
            display_name="Owner",
            password_hash="x",
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        workspace = await Workspace.create(
            organization_id=org.id,
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
            project_id = await project_id_for_workspace(client, workspace_id)
            site_res = await client.get(f"/api/v1/projects/{project_id}/site")
            assert site_res.status_code == 200, site_res.text
            yield client, workspace_id, project_id

        app.dependency_overrides.clear()


def _item_payload() -> dict:
    return {
        "title": "Hello World",
        "locale": "en-US",
        "modelKey": "article",
    }


def _model_payload() -> dict:
    return {
        "singularKey": "article",
        "pluralKey": "articles",
        "name": "Article",
        "fields": [],
        "relations": [],
        "capabilities": [],
        "routing": {"mode": "none"},
        "workflow": {"states": []},
        "views": [],
    }


async def _create_content_model(
    client: AsyncClient,
    project_id: str,
    **overrides: object,
) -> dict:
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/models",
        json={
            **_model_payload(),
            **overrides,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


async def _create_article_model(client: AsyncClient, workspace_id: str) -> dict:
    project_id = await project_id_for_workspace(client, workspace_id)
    return await _create_content_model(
        client,
        project_id,
        category="content_library",
        defaultEditor="rich_text",
        capabilities=["publishable", "rich_text_editable"],
        defaultRole="article",
        defaultPosture="structured",
        defaultSurface="writing",
    )


async def _create_page_model(client: AsyncClient, workspace_id: str) -> dict:
    project_id = await project_id_for_workspace(client, workspace_id)
    return await _create_content_model(
        client,
        project_id,
        singularKey="page",
        pluralKey="pages",
        name="Page",
        category="site_builder",
        capabilities=["publishable", "routable", "treeable"],
        defaultRole="page",
        defaultPosture="page",
        defaultSurface="structured",
    )


def _bootstrap_shape_payload(
    *,
    preset_key: str | None = "post",
    preset_state: str = "selected",
    capability_pack_ids: list[str] | None = None,
) -> dict:
    return {
        "presetKey": preset_key,
        "presetState": preset_state,
        "capabilityPackIds": capability_pack_ids or ["publishable", "schedulable", "seo_managed", "rich_text_editable"],
    }


def _draft_payload() -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": "initial draft",
        "fieldsSnapshot": {
            "title": "Hello World",
            "slug": "hello-world",
            "summary": "This is the canonical summary.",
            "body": "Draft body",
        },
        "presentations": [
            {
                "kind": "form_data",
                "payload": {
                    "title": "Hello World",
                    "slug": "hello-world",
                    "summary": "This is the canonical summary.",
                    "body": "Draft body",
                },
            },
            {"kind": "rich_text_document", "payload": {"type": "doc", "content": []}},
            {
                "kind": "seo",
                "payload": {
                    "metaTitle": "Hello World | Arclayer",
                    "metaDescription": "This is the canonical summary.",
                },
            },
        ],
    }


def _published_write_payload() -> dict:
    return {
        "changeSummary": "illegal published mutation",
        "fieldsSnapshot": {"title": "Should be rejected"},
        "presentations": [],
    }


async def _approve_content_item_for_publish(client: AsyncClient, project_id: str, item_id: str) -> None:
    response = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={
            "stage": "approved",
            "summary": "Approved for publish",
        },
    )
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_content_items_full_workflow_with_first_class_presentations(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]
        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text
        item_uuid = decode_public_id(item_id)
        await ContentVersionRecord.filter(item_id=item_uuid, version=1).update(last_transition_by_user_id=None)

        schedule_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/schedule",
            json={},
        )
        assert schedule_res.status_code == 200, schedule_res.text
        assert schedule_res.json()["data"]["state"] == "scheduled"
        scheduled_row = await ContentVersionRecord.filter(item_id=item_uuid, version=1).first()
        assert scheduled_row is not None
        assert scheduled_row.last_transition_by_user_id is not None
        await ContentVersionRecord.filter(item_id=item_uuid, version=1).update(last_transition_by_user_id=None)

        await _approve_content_item_for_publish(client, project_id, item_id)
        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text
        assert publish_res.json()["data"]["state"] == "published"

        version_row = await ContentVersionRecord.filter(item_id=item_uuid, version=1).first()
        assert version_row is not None
        assert version_row.last_transition_by_user_id is not None

        docs = await PresentationDocumentRecord.filter(version_id=version_row.id).order_by("kind")
        assert [doc.kind for doc in docs] == ["form_data", "rich_text_document", "seo"]


@pytest.mark.asyncio
async def test_content_items_list_is_available_from_canonical_read_endpoint(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text

        list_res = await client.get(f"/api/v1/projects/{project_id}/content/items")
        assert list_res.status_code == 200, list_res.text
        payload = list_res.json()["data"]
        assert payload["total"] == 1
        assert payload["items"][0]["modelKey"] == "article"
        assert payload["items"][0]["bootstrapPresetState"] == "none"
        assert payload["items"][0]["capabilityPackIds"] == []
        assert payload["items"][0]["shapeState"] == "ready"
        assert payload["items"][0]["resolvedSurface"] == "writing"
        assert payload["items"][0]["slug"].startswith("hello-world")


@pytest.mark.asyncio
async def test_content_items_create_requires_model_key_at_api_boundary(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        response = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json={
                "title": "Hello World",
                "locale": "en-US",
            },
        )
        assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_content_items_create_rejects_unknown_model_key(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        response = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json={**_item_payload(), "modelKey": "missing-model"},
        )
        assert response.status_code == 404, response.text
        assert response.json()["error"] == "CONTENT_MODEL_NOT_FOUND"


@pytest.mark.asyncio
async def test_content_items_create_uses_model_defaults_when_model_key_is_provided(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)

        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json={**_item_payload(), "modelKey": "article"},
        )
        assert item_res.status_code == 201, item_res.text

        payload = item_res.json()["data"]
        assert payload["modelKey"] == "article"
        assert payload["resolvedRole"] == "article"
        assert payload["resolvedPosture"] == "structured"
        assert payload["resolvedSurface"] == "writing"
        assert payload["shapeState"] == "ready"

        list_res = await client.get(f"/api/v1/projects/{project_id}/content/items")
        assert list_res.status_code == 200, list_res.text
        listed = list_res.json()["data"]["items"][0]
        assert listed["modelKey"] == "article"
        assert listed["resolvedSurface"] == "writing"


@pytest.mark.asyncio
async def test_content_items_list_returns_active_version_summary(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        list_res = await client.get(f"/api/v1/projects/{project_id}/content/items")
        assert list_res.status_code == 200, list_res.text
        payload = list_res.json()["data"]
        assert payload["total"] == 1
        assert payload["items"][0]["summary"] == "This is the canonical summary."


@pytest.mark.asyncio
async def test_content_items_reads_active_version_title_slug_and_visibility(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json={
                "expectedVersion": 0,
                "changeSummary": "seed draft fields",
                "fieldsSnapshot": {
                    "title": "Editorial title",
                    "summary": "Draft summary",
                    "slug": "editorial-title",
                    "visibility": "private",
                },
                "presentations": [],
            },
        )
        assert draft_res.status_code == 201, draft_res.text

        list_res = await client.get(f"/api/v1/projects/{project_id}/content/items")
        assert list_res.status_code == 200, list_res.text
        listed = list_res.json()["data"]["items"][0]
        assert listed["title"] == "Editorial title"
        assert listed["summary"] == "Draft summary"
        assert listed["slug"] == "editorial-title"
        assert listed["visibility"] == "private"

        detail_res = await client.get(f"/api/v1/projects/{project_id}/content/items/{item_id}")
        assert detail_res.status_code == 200, detail_res.text
        detail = detail_res.json()["data"]
        assert detail["title"] == "Editorial title"
        assert detail["summary"] == "Draft summary"
        assert detail["slug"] == "editorial-title"
        assert detail["visibility"] == "private"


@pytest.mark.asyncio
async def test_content_items_archive_without_versions_marks_item_archived(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        archive_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/archive",
            json={},
        )
        assert archive_res.status_code == 200, archive_res.text
        assert archive_res.json()["data"]["status"] == "archived"
        assert archive_res.json()["data"]["draftVersion"] == 0
        assert archive_res.json()["data"].get("publishedVersion") is None

        item_uuid = decode_public_id(item_id)
        item = await ContentItemRecord.get(id=item_uuid)
        assert str(item.status) == "archived"
        assert item.draft_version == 0
        assert item.published_version is None


@pytest.mark.asyncio
async def test_content_items_unarchive_without_versions_restores_draft_status(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        archive_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/archive",
            json={},
        )
        assert archive_res.status_code == 200, archive_res.text

        unarchive_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/unarchive",
            json={},
        )
        assert unarchive_res.status_code == 200, unarchive_res.text
        assert unarchive_res.json()["data"]["status"] == "draft"
        assert unarchive_res.json()["data"]["draftVersion"] == 0
        assert unarchive_res.json()["data"].get("publishedVersion") is None

        item_uuid = decode_public_id(item_id)
        item = await ContentItemRecord.get(id=item_uuid)
        assert str(item.status) == "draft"
        assert item.draft_version == 0
        assert item.published_version is None


@pytest.mark.asyncio
async def test_content_items_apply_bootstrap_shape_and_track_customized_state(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text
        assert shape_res.json()["data"]["bootstrapPresetKey"] == "post"
        assert shape_res.json()["data"]["bootstrapPresetState"] == "selected"

        customized_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(
                preset_key="post",
                preset_state="customized",
                capability_pack_ids=["publishable", "seo_managed"],
            ),
        )
        assert customized_res.status_code == 200, customized_res.text
        assert customized_res.json()["data"]["bootstrapPresetState"] == "customized"
        assert customized_res.json()["data"]["capabilityPackIds"] == ["publishable", "seo_managed"]


@pytest.mark.asyncio
async def test_content_items_reject_direct_writes_to_published_version(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        await _approve_content_item_for_publish(client, project_id, item_id)
        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text

        patch_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1",
            json=_published_write_payload(),
        )
        assert patch_res.status_code == 409, patch_res.text
        assert patch_res.json()["error"] == "CONTENT_VERSION_IMMUTABLE"
        assert patch_res.json()["message"] == "Non-draft version is immutable"


@pytest.mark.asyncio
async def test_content_items_return_single_item_detail(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        detail_res = await client.get(f"/api/v1/projects/{project_id}/content/items/{item_id}")
        assert detail_res.status_code == 200, detail_res.text
        data = detail_res.json()["data"]
        assert data["id"] == item_id
        assert data["title"] == "Hello World"
        assert data["draftVersion"] == 0


@pytest.mark.asyncio
async def test_content_items_return_version_detail_with_fields_snapshot_and_presentations(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        version_res = await client.get(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1",
        )
        assert version_res.status_code == 200, version_res.text
        data = version_res.json()["data"]
        assert data["fieldsSnapshot"]["title"] == "Hello World"
        assert {entry["kind"] for entry in data["presentations"]} == {
            "form_data",
            "rich_text_document",
            "seo",
        }


@pytest.mark.asyncio
async def test_content_items_list_versions_endpoint_returns_latest_first(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text

        first_draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert first_draft_res.status_code == 201, first_draft_res.text

        await _approve_content_item_for_publish(client, project_id, item_id)
        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text

        second_draft_payload = _draft_payload()
        second_draft_payload["expectedVersion"] = 1
        second_draft_payload["changeSummary"] = "follow-up draft"
        second_draft_payload["fieldsSnapshot"]["summary"] = "Next draft summary"
        second_draft_payload["presentations"][0]["payload"]["summary"] = "Next draft summary"

        second_draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=second_draft_payload,
        )
        assert second_draft_res.status_code == 201, second_draft_res.text

        versions_res = await client.get(f"/api/v1/projects/{project_id}/content/items/{item_id}/versions")
        assert versions_res.status_code == 200, versions_res.text
        data = versions_res.json()["data"]
        assert data["total"] == 2
        assert [entry["versionNumber"] for entry in data["items"]] == [2, 1]
        assert data["items"][0]["changeSummary"] == "follow-up draft"
        assert data["items"][1]["state"] == "published"


@pytest.mark.asyncio
async def test_content_item_mutations_emit_workspace_activity_events(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        workspace_uuid = decode_public_id(workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]
        item_uuid = decode_public_id(item_id)

        await _wait_latest_workspace_audit_event(
            event_name="project.content.item.created",
            workspace_id=workspace_uuid,
            entity_id=item_uuid,
        )

        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text
        await _wait_latest_workspace_audit_event(
            event_name="project.content.item.bootstrap.applied",
            workspace_id=workspace_uuid,
            entity_id=item_uuid,
        )

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text
        await _wait_latest_workspace_audit_event(
            event_name="project.content.version.saved",
            workspace_id=workspace_uuid,
            entity_id=item_uuid,
        )

        await _approve_content_item_for_publish(client, project_id, item_id)
        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text
        await _wait_latest_workspace_audit_event(
            event_name="project.content.version.published",
            workspace_id=workspace_uuid,
            entity_id=item_uuid,
        )

        activity_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/activity?entityType=content_item&entityId={item_id}&page=1&size=10"
        )
        assert activity_res.status_code == 200, activity_res.text
        items = activity_res.json()["data"]["items"]
        assert [entry["eventName"] for entry in items[:5]] == [
            "project.content.version.published",
            "project.content.item.workflow.updated",
            "project.content.version.saved",
            "project.content.item.bootstrap.applied",
            "project.content.item.created",
        ]


@pytest.mark.asyncio
async def test_content_items_archive_transition_is_explicit_and_terminal_for_publish(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]
        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        await _approve_content_item_for_publish(client, project_id, item_id)
        publish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text
        assert publish_res.json()["data"]["state"] == "published"

        archive_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/archive",
            json={},
        )
        assert archive_res.status_code == 200, archive_res.text
        assert archive_res.json()["data"]["state"] == "archived"

        republish_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert republish_res.status_code == 409, republish_res.text
        assert republish_res.json()["error"] == "CONTENT_VERSION_TRANSITION_INVALID"

        item_uuid = decode_public_id(item_id)
        archived_version = await ContentVersionRecord.filter(item_id=item_uuid, version=1).first()
        assert archived_version is not None
        assert archived_version.last_transition_by_user_id is not None


@pytest.mark.asyncio
async def test_content_items_reject_selected_preset_state_without_preset_key(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        invalid_shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(preset_key=None, preset_state="selected"),
        )
        assert invalid_shape_res.status_code == 409, invalid_shape_res.text
        assert invalid_shape_res.json()["error"] == "CONTENT_BOOTSTRAP_PRESET_INVALID"


@pytest.mark.asyncio
async def test_content_items_duplicate_creates_new_draft_copy_with_presentations(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        shape_res = await client.patch(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        duplicate_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/duplicate",
            json={},
        )
        assert duplicate_res.status_code == 200, duplicate_res.text

        duplicated = duplicate_res.json()["data"]
        assert duplicated["id"] != item_id
        assert duplicated["status"] == "draft"
        assert "publishedVersion" not in duplicated
        assert duplicated["draftVersion"] == 1
        assert duplicated["bootstrapPresetState"] == "selected"
        assert duplicated["capabilityPackIds"] == [
            "publishable",
            "schedulable",
            "seo_managed",
            "rich_text_editable",
        ]

        duplicate_uuid = decode_public_id(duplicated["id"])
        duplicate_version = await ContentVersionRecord.get(item_id=duplicate_uuid, version=1)
        docs = await PresentationDocumentRecord.filter(version_id=duplicate_version.id).order_by("kind")
        assert [doc.kind for doc in docs] == ["form_data", "rich_text_document", "seo"]
        assert duplicate_version.fields_snapshot == {
            "title": "Hello World",
            "slug": "hello-world",
            "summary": "This is the canonical summary.",
            "body": "Draft body",
        }


@pytest.mark.asyncio
async def test_content_items_delete_removes_item_and_versions(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload(),
        )
        assert draft_res.status_code == 201, draft_res.text

        item_uuid = decode_public_id(item_id)
        delete_res = await client.delete(f"/api/v1/projects/{project_id}/content/items/{item_id}")
        assert delete_res.status_code == 200, delete_res.text

        assert await ContentItemRecord.filter(id=item_uuid).exists() is False
        assert await ContentVersionRecord.filter(item_id=item_uuid).exists() is False
