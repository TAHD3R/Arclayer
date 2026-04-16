from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.model_field import ContentModelFieldRecord
from src.models.content.model_relation import ContentModelRelationRecord
from src.models.content.model_view import ContentModelViewRecord
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


def _blank_first_create_payload() -> dict:
    return {
        "key": "article",
        "name": "Article",
    }


def _explicit_update_payload() -> dict:
    return {
        "description": "Updated contract",
        "fields": [
            {
                "key": "reading_time_minutes",
                "label": "Reading Time",
                "scalar": "number",
                "required": False,
                "config": {"min": 0},
            }
        ],
        "relations": [
            {
                "key": "primary_category",
                "relation": "many_to_one",
                "targetModelKey": "category",
                "required": False,
                "config": {"display": "inline"},
            }
        ],
        "views": [
            {
                "key": "table_main",
                "label": "Main Table",
                "type": "table",
                "config": {"columns": ["title", "reading_time_minutes"]},
            }
        ],
    }


async def _preview_model_update(
    client: AsyncClient,
    *,
    workspace_id: str,
    model_id: str,
    payload: dict,
):
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/content/models/{model_id}/impact-preview",
        json=payload,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def _patch_model_with_preview(
    client: AsyncClient,
    *,
    workspace_id: str,
    model_id: str,
    payload: dict,
):
    preview = await _preview_model_update(
        client,
        workspace_id=workspace_id,
        model_id=model_id,
        payload=payload,
    )
    response = await client.patch(
        f"/api/v1/workspaces/{workspace_id}/content/models/{model_id}",
        json={
            **payload,
            "impactPreviewToken": preview["previewToken"],
        },
    )
    return response


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


@pytest.mark.asyncio
async def test_content_models_create_blank_first_payload_returns_201(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert response.status_code == 201, response.text
        payload = response.json()["data"]
        assert payload["key"] == "article"
        assert payload["name"] == "Article"
        assert "kind" not in payload
        assert payload["protocolKey"] == "article"
        assert payload["protocolVersion"] == 1
        assert payload["systemManaged"] is True
        assert payload["systemFieldKeys"] == ["title", "slug", "summary", "content", "published_at"]
        assert payload["draftContractRevision"] == 1
        assert payload["publishedContractRevision"] == 1

        saved = await ContentModelDefinitionRecord.filter(key="article").first()
        assert saved is not None
        assert saved.name == "Article"
        assert saved.category == "content_library"
        assert saved.default_editor == "rich_text"
        assert saved.protocol_key == "article"
        assert saved.protocol_version == 1
        assert saved.is_system_managed is True
        assert saved.system_field_keys == ["title", "slug", "summary", "content", "published_at"]
        assert saved.draft_contract_revision == 1
        assert saved.published_contract_revision == 1
        assert saved.capabilities == [
            "versioned",
            "routable",
            "rich_text_editable",
            "has_relations",
            "publishable",
            "seo_managed",
        ]
        assert saved.routing_policy == {"mode": "single", "slug_field": "slug"}
        assert saved.presentation_policy == {"allowedKinds": ["form_data", "rich_text_document", "seo"]}
        assert saved.seo_policy == {"titleField": "title", "descriptionField": "summary"}
        assert saved.workflow_policy == {"states": ["draft", "published"], "initial_state": "draft"}
        assert saved.published_contract_snapshot is not None

        list_response = await client.get(f"/api/v1/workspaces/{workspace_id}/content/models")
        assert list_response.status_code == 200, list_response.text
        model_payload = list_response.json()["data"]["items"][0]
        assert model_payload["key"] == "article"
        assert model_payload["protocolKey"] == "article"
        assert model_payload["category"] == "content_library"
        assert model_payload["defaultEditor"] == "rich_text"
        assert model_payload["fieldSchema"]["content"]["scalar"] == "long_text"


@pytest.mark.asyncio
async def test_content_models_patch_updates_explicit_contract_sections(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        patch_response = await _patch_model_with_preview(
            client,
            workspace_id=workspace_id,
            model_id=model_id,
            payload=_explicit_update_payload(),
        )
        assert patch_response.status_code == 200, patch_response.text
        patched_payload = patch_response.json()["data"]
        assert patched_payload["name"] == "Article"
        assert patched_payload["protocolKey"] == "article"
        assert patched_payload["systemManaged"] is True
        assert patched_payload["draftContractRevision"] == 2
        assert patched_payload["publishedContractRevision"] == 1
        assert patched_payload["impact"]["hasBreakingChanges"] is False
        assert patched_payload["impact"]["breakingChanges"] == []
        assert patched_payload["impact"]["warnings"] == []

        saved = await ContentModelDefinitionRecord.filter(key="article").first()
        assert saved is not None
        assert saved.name == "Article"
        assert saved.description == "Updated contract"
        assert saved.category == "content_library"
        assert saved.default_editor == "rich_text"
        assert saved.capabilities == [
            "versioned",
            "routable",
            "rich_text_editable",
            "has_relations",
            "publishable",
            "seo_managed",
        ]
        assert saved.routing_policy == {"mode": "single", "slug_field": "slug"}
        assert saved.presentation_policy == {"allowedKinds": ["form_data", "rich_text_document", "seo"]}
        assert saved.seo_policy == {"titleField": "title", "descriptionField": "summary"}
        assert saved.workflow_policy == {"states": ["draft", "published"], "initial_state": "draft"}
        assert saved.draft_contract_revision == 2
        assert saved.published_contract_revision == 1
        assert saved.published_contract_snapshot is not None
        published_snapshot = dict(saved.published_contract_snapshot)
        published_snapshot_fields = {field["key"] for field in published_snapshot["fields"]}
        assert "reading_time_minutes" not in published_snapshot_fields

        saved_fields = await ContentModelFieldRecord.filter(model_definition_id=saved.id).order_by("sort_order")
        assert [field.key for field in saved_fields] == [
            "title",
            "slug",
            "summary",
            "content",
            "published_at",
            "reading_time_minutes",
        ]
        assert saved_fields[-1].label == "Reading Time"

        saved_relations = await ContentModelRelationRecord.filter(model_definition_id=saved.id).order_by("sort_order")
        assert len(saved_relations) == 1
        assert saved_relations[0].key == "primary_category"
        assert saved_relations[0].target_model_key == "category"

        saved_views = await ContentModelViewRecord.filter(model_definition_id=saved.id).order_by("sort_order")
        assert len(saved_views) == 1
        assert saved_views[0].key == "table_main"


@pytest.mark.asyncio
async def test_content_models_rejects_template_key_or_preset_metadata_payload(
    prepared_db,
    integration_valkey_settings,
) -> None:
    payload = {
        **_blank_first_create_payload(),
        "templateKey": "blog_post",
        "preset": {"id": "starter", "version": 1},
    }

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=payload,
        )
        assert response.status_code in {400, 422}, response.text


@pytest.mark.asyncio
async def test_content_models_rejects_kind_in_create_and_patch_payloads(
    prepared_db,
    integration_valkey_settings,
) -> None:
    create_payload = {
        **_blank_first_create_payload(),
        "kind": "page",
    }

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=create_payload,
        )
        assert create_response.status_code in {400, 422}, create_response.text

        baseline_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert baseline_response.status_code == 201, baseline_response.text
        model_id = baseline_response.json()["data"]["id"]

        patch_response = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/models/{model_id}",
            json={"kind": "post"},
        )
        assert patch_response.status_code in {400, 422}, patch_response.text


@pytest.mark.asyncio
async def test_content_models_patch_returns_breaking_impact_for_destructive_schema_edits(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        seed_response = await _patch_model_with_preview(
            client,
            workspace_id=workspace_id,
            model_id=model_id,
            payload=_explicit_update_payload(),
        )
        assert seed_response.status_code == 200, seed_response.text

        destructive_response = await _patch_model_with_preview(
            client,
            workspace_id=workspace_id,
            model_id=model_id,
            payload={
                "fields": [],
                "relations": [],
            },
        )
        assert destructive_response.status_code == 200, destructive_response.text
        impact = destructive_response.json()["data"]["impact"]
        assert impact["hasBreakingChanges"] is True
        codes = {entry["code"] for entry in impact["breakingChanges"]}
        assert "field_removed" in codes
        assert "relation_removed" in codes


@pytest.mark.asyncio
async def test_content_models_rejects_non_official_model_keys(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        response = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json={"key": "author", "name": "Author"},
        )
        assert response.status_code == 409, response.text
        assert response.json()["error"] == "CONTENT_MODEL_PROTOCOL_UNSUPPORTED"
