from __future__ import annotations

from contextlib import asynccontextmanager
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


def _blank_first_create_payload() -> dict:
    return {
        "singularKey": "article",
        "pluralKey": "articles",
        "name": "Article",
    }


def _custom_collection_create_payload() -> dict:
    return {
        "singularKey": "product",
        "pluralKey": "products",
        "name": "Product",
        "modelKind": "collection_type",
        "fields": [],
        "relations": [],
        "capabilities": ["queryable"],
        "routing": {"mode": "none"},
        "workflow": {"states": ["draft"], "initialState": "draft"},
        "views": [],
    }


def _explicit_update_payload() -> dict:
    return {
        "description": "Updated contract",
        "fields": [
            {
                "key": "readingTimeMinutes",
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
                "config": {"columns": ["title", "readingTimeMinutes"]},
            }
        ],
    }


async def _preview_model_update(
    client: AsyncClient,
    *,
    project_id: str,
    model_id: str,
    payload: dict,
):
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/models/{model_id}/impact-preview",
        json=payload,
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def _patch_model_with_preview(
    client: AsyncClient,
    *,
    project_id: str,
    model_id: str,
    payload: dict,
):
    preview = await _preview_model_update(
        client,
        project_id=project_id,
        model_id=model_id,
        payload=payload,
    )
    response = await client.patch(
        f"/api/v1/projects/{project_id}/content/models/{model_id}",
        json={
            **payload,
            "impactPreviewToken": preview["previewToken"],
        },
    )
    return response


async def _list_model_payload(client: AsyncClient, *, project_id: str, singular_key: str) -> dict:
    list_response = await client.get(f"/api/v1/projects/{project_id}/content/models")
    assert list_response.status_code == 200, list_response.text
    for item in list_response.json()["data"]["items"]:
        if item["singularKey"] == singular_key:
            return item
    raise AssertionError(f"Content model not found: {singular_key}")


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


@pytest.mark.asyncio
async def test_content_models_create_blank_first_payload_returns_201(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert response.status_code == 201, response.text
        payload = response.json()["data"]
        assert payload["singularKey"] == "article"
        assert payload["pluralKey"] == "articles"
        assert payload["name"] == "Article"
        assert "key" not in payload
        assert "kind" not in payload
        assert payload["protocolKey"] == "article"
        assert payload["protocolVersion"] == 1
        assert payload["systemManaged"] is True
        assert payload["systemFieldKeys"] == ["title", "slug", "summary", "content", "published_at"]
        assert payload["draftContractRevision"] == 1
        assert payload["publishedContractRevision"] == 1

        model_payload = await _list_model_payload(client, project_id=project_id, singular_key="article")
        assert model_payload["singularKey"] == "article"
        assert model_payload["pluralKey"] == "articles"
        assert "key" not in model_payload
        assert model_payload["protocolKey"] == "article"
        assert model_payload["category"] == "content_library"
        assert model_payload["defaultEditor"] == "rich_text"
        assert model_payload["fieldSchema"]["content"]["scalar"] == "long_text"


@pytest.mark.asyncio
async def test_content_models_patch_updates_explicit_contract_sections(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_custom_collection_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        patch_response = await _patch_model_with_preview(
            client,
            project_id=project_id,
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

        saved_payload = await _list_model_payload(client, project_id=project_id, singular_key="article")
        assert saved_payload["name"] == "Article"
        assert saved_payload["description"] == "Updated contract"
        assert saved_payload["category"] == "content_library"
        assert saved_payload["defaultEditor"] == "rich_text"
        assert saved_payload["draftContractRevision"] == 2
        assert saved_payload["publishedContractRevision"] == 1
        assert saved_payload["fieldSchema"]["readingTimeMinutes"]["label"] == "Reading Time"
        assert saved_payload["relationSchema"]["primary_category"]["targetModelKey"] == "category"
        assert saved_payload["viewSchema"]["views"][0]["key"] == "table_main"


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

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
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

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=create_payload,
        )
        assert create_response.status_code in {400, 422}, create_response.text

        baseline_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert baseline_response.status_code == 201, baseline_response.text
        model_id = baseline_response.json()["data"]["id"]

        patch_response = await client.patch(
            f"/api/v1/projects/{project_id}/content/models/{model_id}",
            json={"kind": "post"},
        )
        assert patch_response.status_code in {400, 422}, patch_response.text


@pytest.mark.asyncio
async def test_content_models_patch_returns_breaking_impact_for_destructive_schema_edits(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        seed_response = await _patch_model_with_preview(
            client,
            project_id=project_id,
            model_id=model_id,
            payload=_explicit_update_payload(),
        )
        assert seed_response.status_code == 200, seed_response.text

        destructive_response = await _patch_model_with_preview(
            client,
            project_id=project_id,
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
async def test_content_models_impact_preview_returns_field_lifecycle_codes(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_custom_collection_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        seed_response = await _patch_model_with_preview(
            client,
            project_id=project_id,
            model_id=model_id,
            payload={
                "fields": [
                    {
                        "key": "rating",
                        "label": "Rating",
                        "scalar": "number",
                        "required": False,
                        "config": {"kind": "number"},
                    },
                    {
                        "key": "seo",
                        "label": "SEO",
                        "scalar": "json",
                        "required": False,
                        "config": {"kind": "component", "targetComponentKey": "seoCard"},
                    },
                    {
                        "key": "sections",
                        "label": "Sections",
                        "scalar": "json",
                        "required": False,
                        "config": {"kind": "dynamic_zone", "components": ["heroBlock"]},
                    },
                ],
                "relations": [],
            },
        )
        assert seed_response.status_code == 200, seed_response.text

        preview = await _preview_model_update(
            client,
            project_id=project_id,
            model_id=model_id,
            payload={
                "fields": [
                    {
                        "key": "rating",
                        "label": "Rating",
                        "scalar": "number",
                        "required": False,
                        "config": {"kind": "number", "unique": True, "omitFromApiResponse": True},
                    },
                    {
                        "key": "seo",
                        "label": "SEO",
                        "scalar": "json",
                        "required": False,
                        "config": {"kind": "component", "targetComponentKey": "openGraphCard"},
                    },
                    {
                        "key": "sections",
                        "label": "Sections",
                        "scalar": "json",
                        "required": False,
                        "config": {"kind": "dynamic_zone", "components": ["heroBlock", "quoteBlock"]},
                    },
                ],
                "relations": [],
            },
        )

        impact = preview["impact"]
        codes = {entry["code"] for entry in impact["breakingChanges"]}
        assert impact["hasBreakingChanges"] is True
        assert {
            "field_delivery_omitted",
            "field_unique_enabled",
            "field_component_target_changed",
            "field_dynamic_zone_components_changed",
        } <= codes
        targets = {entry["target"] for entry in impact["breakingChanges"]}
        assert "fields.rating.config.omitFromApiResponse" in targets
        assert "fields.rating.config.unique" in targets


@pytest.mark.asyncio
async def test_content_models_create_custom_content_type_with_dual_identifiers(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={
                "singularKey": "author",
                "pluralKey": "authors",
                "name": "Author",
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
        assert response.status_code == 201, response.text
        payload = response.json()["data"]
        assert payload["singularKey"] == "author"
        assert payload["pluralKey"] == "authors"
        assert payload["name"] == "Author"
        assert payload["description"] == "Editorial profile records."
        assert payload["systemManaged"] is False
        assert "key" not in payload

        saved_payload = await _list_model_payload(client, project_id=project_id, singular_key="author")
        assert saved_payload["pluralKey"] == "authors"


@pytest.mark.asyncio
async def test_content_models_list_supports_search_filters_and_field_count_ordering(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        first = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={
                "singularKey": "profile",
                "pluralKey": "profiles",
                "name": "Profile",
                "description": "People profile records.",
                "fields": [
                    {"key": "title", "label": "Title", "scalar": "text"},
                ],
            },
        )
        assert first.status_code == 201, first.text

        second = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={
                "singularKey": "pressRelease",
                "pluralKey": "pressReleases",
                "name": "Press Release",
                "description": "Media announcement records.",
                "fields": [
                    {"key": "headline", "label": "Headline", "scalar": "text"},
                    {"key": "body", "label": "Body", "scalar": "long_text"},
                ],
            },
        )
        assert second.status_code == 201, second.text

        filtered = await client.get(
            f"/api/v1/projects/{project_id}/content/models",
            params={
                "q": "records",
                "category": "custom",
                "model_kind": "collection_type",
                "system_managed": "false",
                "ordering": "-field_count",
            },
        )
        assert filtered.status_code == 200, filtered.text
        items = filtered.json()["data"]["items"]
        assert [item["singularKey"] for item in items] == ["pressRelease", "profile"]
        assert all(item["updatedBy"]["userId"] for item in items)
        assert all(item["updatedBy"]["username"].startswith("owner_") for item in items)

        searched = await client.get(
            f"/api/v1/projects/{project_id}/content/models",
            params={"q": "profiles"},
        )
        assert searched.status_code == 200, searched.text
        assert [item["singularKey"] for item in searched.json()["data"]["items"]] == ["profile"]


@pytest.mark.asyncio
async def test_content_models_rejects_identical_singular_and_plural_identifiers(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={"singularKey": "news", "pluralKey": "news", "name": "News"},
        )
        assert response.status_code in {400, 409, 422}, response.text


@pytest.mark.asyncio
async def test_content_models_rejects_duplicate_and_cross_identifier_collisions(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        first = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={"singularKey": "author", "pluralKey": "authors", "name": "Author"},
        )
        assert first.status_code == 201, first.text

        duplicate_singular = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={"singularKey": "author", "pluralKey": "writers", "name": "Writer"},
        )
        assert duplicate_singular.status_code in {400, 409, 422}, duplicate_singular.text

        duplicate_plural = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={"singularKey": "writer", "pluralKey": "authors", "name": "Writer"},
        )
        assert duplicate_plural.status_code in {400, 409, 422}, duplicate_plural.text

        singular_matches_existing_plural = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={"singularKey": "authors", "pluralKey": "authorGroups", "name": "Author Group"},
        )
        assert singular_matches_existing_plural.status_code in {400, 409, 422}, singular_matches_existing_plural.text

        plural_matches_existing_singular = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json={"singularKey": "profile", "pluralKey": "author", "name": "Profile"},
        )
        assert plural_matches_existing_singular.status_code in {400, 409, 422}, plural_matches_existing_singular.text
