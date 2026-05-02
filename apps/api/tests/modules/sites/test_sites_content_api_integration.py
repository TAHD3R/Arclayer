from __future__ import annotations

import hashlib
import time
from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.registry import create_app
from src.modules.projects.runtime.router import get_runtime_context
from src.modules.sites.content_api.entries_router import get_content_delivery_query_service
from src.modules.sites.graphql.service import StructuredContentRecord
from src.settings.crypto import ensure_master_key
from tests.core.test_api_boundary_routes_unit import _runtime_context
from tests.modules.sites.test_sites_canonical_content_runtime_integration import (
    _create_article_item,
    _page_draft_payload,
    _publish_article_version,
    _save_article_draft,
    _upsert_route_binding,
    _workspace_client,
)
from tests.modules.sites.test_sites_delivery_integration import _publish_release, _runtime_id_and_preview_token
from tests.modules.workspaces.content.test_content_items_integration import _create_article_model, _create_page_model
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


async def _create_delivery_key(client, project_id: str, *, name: str, scopes: list[str], perspective: str) -> str:
    response = await client.post(
        f"/api/v1/projects/{project_id}/api-keys",
        json={
            "family": "delivery",
            "name": name,
            "scopes": scopes,
            "deliveryPerspective": perspective,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]["secretToken"]


async def _create_page_template_item(client, project_id: str, *, title: str) -> str:
    response = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json={"modelKey": "page", "title": title, "locale": "en-US"},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


async def _publish_page_template_item(client, project_id: str, *, item_id: str, title: str, path: str) -> None:
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json={**_page_draft_payload(title=title, path=path), "expectedVersion": 1},
    )
    assert draft_res.status_code == 201, draft_res.text
    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={"stage": "approved", "summary": f"{title} approved for publish"},
    )
    assert workflow_res.status_code == 200, workflow_res.text
    publish_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/2/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_content_api_entries_read_published_preview_and_auth_boundaries(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_article_model(client, workspace_id)
        await _create_page_model(client, workspace_id)
        article_id = await _create_article_item(client, project_id, slug="world", title="World v1")
        page_id = await _create_page_template_item(client, project_id, title="Article Template")
        await _save_article_draft(
            client,
            project_id,
            item_id=article_id,
            expected_version=1,
            title="World v1",
            slug="world",
        )
        await _publish_article_version(client, project_id, item_id=article_id, version=2)
        await _publish_page_template_item(
            client,
            project_id,
            item_id=page_id,
            title="Article Template",
            path="/blog/:slug",
        )
        await _upsert_route_binding(
            client,
            project_id,
            item_id=page_id,
            path="/blog/:slug",
            route_mode="dynamic",
            primary_source={"modelKey": "article", "fieldKey": "slug", "paramName": "slug"},
        )
        await _publish_release(client, project_id)

        runtime_id, preview_token = await _runtime_id_and_preview_token(client, project_id)
        published_key = await _create_delivery_key(
            client,
            project_id,
            name="Published Content API",
            scopes=["delivery.read"],
            perspective="published",
        )
        preview_key = await _create_delivery_key(
            client,
            project_id,
            name="Preview Content API",
            scopes=["delivery.read"],
            perspective="preview",
        )
        scope_failure_key = await _create_delivery_key(
            client,
            project_id,
            name="GraphQL Only",
            scopes=["graphql.read"],
            perspective="published",
        )
        await _save_article_draft(
            client,
            project_id,
            item_id=article_id,
            expected_version=2,
            title="World v2 draft",
            slug="world",
        )

        public_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/content/article",
            params={"filterField": "slug", "filterValue": "world", "locale": "en-US"},
        )
        assert public_res.status_code == 200, public_res.text
        public_items = public_res.json()["data"]["items"]
        assert public_items, public_res.text
        assert public_items[0]["title"] == "World v1"

        contains_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/content/article",
            params={"containsField": "title", "containsValue": "WORLD"},
        )
        assert contains_res.status_code == 200, contains_res.text
        assert contains_res.json()["data"]["items"][0]["id"] == article_id

        published_key_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/content/article/{article_id}",
            headers={"x-api-key": published_key},
        )
        assert published_key_res.status_code == 200, published_key_res.text
        assert published_key_res.json()["data"]["revisionState"] == "published"

        preview_missing_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/content/article",
            params={"perspective": "preview"},
        )
        assert preview_missing_res.status_code == 403, preview_missing_res.text
        assert preview_missing_res.json()["error"] == "PREVIEW_TOKEN_REQUIRED"

        preview_token_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/content/article",
            params={"perspective": "preview", "previewToken": preview_token},
        )
        assert preview_token_res.status_code == 200, preview_token_res.text
        assert preview_token_res.json()["data"]["items"][0]["title"] == "World v2 draft"

        preview_key_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/content/article",
            params={"perspective": "preview"},
            headers={"Authorization": f"Bearer {preview_key}"},
        )
        assert preview_key_res.status_code == 200, preview_key_res.text
        assert preview_key_res.json()["data"]["items"][0]["revisionState"] == "draft"

        admin_bearer_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/content/article",
            headers={"Authorization": "Bearer admin-session-token"},
        )
        assert admin_bearer_res.status_code == 403, admin_bearer_res.text
        assert admin_bearer_res.json()["error"] == "API_KEY_INVALID"

        scope_failure_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/content/article",
            headers={"x-api-key": scope_failure_key},
        )
        assert scope_failure_res.status_code == 403, scope_failure_res.text
        assert scope_failure_res.json()["error"] == "DELIVERY_SCOPE_REQUIRED"

    get_settings.cache_clear()


class _FakeContentQueryService:
    def with_database_connection(self, conn):
        return self

    async def list_records(self, *, runtime_id: UUID, model_key: str, perspective: str, **kwargs):
        return [
            StructuredContentRecord(
                item_id=uuid4(),
                translation_group_id=None,
                model_key=model_key,
                locale="en-US",
                title="Rate limited",
                slug="rate-limited",
                revision=1,
                revision_state="published",
                draft_revision=1,
                published_revision=1,
                fields={"title": "Rate limited"},
                custom_fields={},
            )
        ]


@pytest.mark.asyncio
async def test_content_api_entries_route_has_rate_limit(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__ENABLE_RATE_LIMITING", "1")
    monkeypatch.setenv("SECURITY__RATE_LIMIT", "1000")
    monkeypatch.setenv("SECURITY__RATE_LIMIT_WINDOW", "60")
    monkeypatch.setenv("LOGGING__DIR", str(tmp_path / "logs"))
    get_settings.cache_clear()

    runtime_id = uuid4()
    app = create_app()
    app.dependency_overrides[get_runtime_context] = lambda: _runtime_context(runtime_id=runtime_id, site_id=uuid4())
    app.dependency_overrides[get_content_delivery_query_service] = lambda: _FakeContentQueryService()

    async with asgi_client(app) as client:
        responses = [
            await client.get(
                f"/content-api/v1/runtimes/{runtime_id}/content/article",
                params={"filterField": "slug"},
            )
            for _ in range(61)
        ]

    assert responses[0].status_code == 400, responses[0].text
    assert responses[0].json()["error"] == "CONTENT_API_FILTER_PAIR_REQUIRED"
    assert responses[-1].status_code == 429
    assert responses[-1].json()["error"] == "CONTENT_API_RATE_LIMITED"
    assert responses[-1].json()["message"] == "Content API rate limit exceeded"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_content_api_graphql_route_has_rate_limit(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    monkeypatch.setenv("SECURITY__ENABLED", "1")
    monkeypatch.setenv("SECURITY__ENABLE_RATE_LIMITING", "1")
    monkeypatch.setenv("SECURITY__RATE_LIMIT", "1000")
    monkeypatch.setenv("SECURITY__RATE_LIMIT_WINDOW", "60")
    monkeypatch.setenv("LOGGING__DIR", str(tmp_path / "logs"))
    get_settings.cache_clear()

    runtime_id = uuid4()
    app = create_app()
    app.dependency_overrides[get_runtime_context] = lambda: _runtime_context(runtime_id=runtime_id, site_id=uuid4())
    path = f"/content-api/v1/runtimes/{runtime_id}/graphql"
    digest = hashlib.sha256(b"127.0.0.1").hexdigest()
    app.state.content_api_rate_counters = {f"content-api:read:{path}:{digest}": (time.monotonic() + 60, 60)}

    async with asgi_client(app) as client:
        response = await client.post(path, json={"query": "query { __typename }"})

    assert response.status_code == 429
    assert response.json()["error"] == "CONTENT_API_RATE_LIMITED"
    assert response.json()["message"] == "Content API rate limit exceeded"

    get_settings.cache_clear()
