from __future__ import annotations

import pytest

from src.config import get_settings
from src.settings.crypto import ensure_master_key
from tests.modules.sites.test_sites_canonical_content_runtime_integration import (
    _create_page_item,
    _publish_article_version,
    _upsert_route_binding,
    _workspace_client,
)
from tests.modules.sites.test_sites_delivery_integration import _publish_release
from tests.modules.workspaces.content.test_content_items_integration import (
    _create_content_model,
    _create_page_model,
)

pytestmark = pytest.mark.integration


def _article_draft_payload(*, expected_version: int, title: str, slug: str, rating: int) -> dict:
    return {
        "expectedVersion": expected_version,
        "changeSummary": f"{title} draft",
        "fieldsSnapshot": {
            "title": title,
            "slug": slug,
            "summary": f"{title} summary",
            "content": f"{title} body",
            "rating": rating,
        },
        "presentations": [
            {
                "kind": "form_data",
                "payload": {
                    "title": title,
                    "slug": slug,
                    "summary": f"{title} summary",
                    "content": f"{title} body",
                    "rating": rating,
                },
            },
            {"kind": "rich_text_document", "payload": {"type": "doc", "content": []}},
        ],
    }


def _page_template_draft_payload(*, title: str, path: str) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": f"{title} draft",
        "fieldsSnapshot": {"title": title, "path": path},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title, "path": path}},
            {
                "kind": "visual_blueprint",
                "payload": {
                    "rootId": "page_root",
                    "nodesById": {
                        "page_root": {
                            "id": "page_root",
                            "type": "page_root",
                            "children": ["hero"],
                            "layout": {"children": {"mode": "auto", "direction": "column"}},
                        },
                        "hero": {
                            "id": "hero",
                            "type": "hero_banner",
                            "props": {},
                        },
                    },
                },
            },
            {
                "kind": "slot_mapping",
                "payload": {
                    "version": 1,
                    "sections": {
                        "hero": {
                            "props": {
                                "headline": {
                                    "kind": "context_path",
                                    "source": "primary",
                                    "path": ["title"],
                                },
                                "rating": {
                                    "kind": "context_path",
                                    "source": "primary",
                                    "path": ["rating"],
                                },
                            },
                        }
                    },
                },
            },
        ],
    }


async def _create_article_item(client, project_id: str, *, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json={"modelKey": "article", "title": title, "locale": "en-US"},
    )
    assert item_res.status_code == 201, item_res.text
    return item_res.json()["data"]["id"]


async def _create_generic_item(client, project_id: str, *, model_key: str, title: str) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json={"modelKey": model_key, "title": title, "locale": "en-US"},
    )
    assert item_res.status_code == 201, item_res.text
    return item_res.json()["data"]["id"]


def _simple_form_draft_payload(*, expected_version: int, fields_snapshot: dict) -> dict:
    return {
        "expectedVersion": expected_version,
        "changeSummary": "simple draft",
        "fieldsSnapshot": fields_snapshot,
        "presentations": [
            {
                "kind": "form_data",
                "payload": fields_snapshot,
            }
        ],
    }


async def _publish_page_template(client, project_id: str, *, item_id: str, title: str, path: str) -> None:
    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=_page_template_draft_payload(title=title, path=path),
    )
    assert draft_res.status_code == 201, draft_res.text
    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={"stage": "approved", "summary": f"{title} approved for publish"},
    )
    assert workflow_res.status_code == 200, workflow_res.text
    publish_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


async def _runtime_id_and_preview_token(client, project_id: str) -> tuple[str, str]:
    project_res = await client.get(f"/api/v1/projects/{project_id}")
    assert project_res.status_code == 200, project_res.text
    runtime_id = project_res.json()["data"]["primaryRuntime"]["id"]
    token_res = await client.post(f"/api/v1/projects/{project_id}/site/preview-tokens", json={"ttlSeconds": 600})
    assert token_res.status_code == 201, token_res.text
    return runtime_id, token_res.json()["data"]["token"]


async def _graphql(
    client,
    runtime_id: str,
    *,
    query: str,
    variables: dict | None = None,
    headers: dict | None = None,
):
    return await client.post(
        f"/api/v1/runtimes/{runtime_id}/graphql",
        json={"query": query, "variables": variables or {}},
        headers=headers or {},
    )


@pytest.mark.asyncio
async def test_sites_graphql_queries_follow_published_preview_and_custom_fields(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_page_model(client, workspace_id)
        await _create_content_model(
            client,
            project_id,
            key="article",
            name="Article",
            category="content_library",
            fields=[{"key": "rating", "label": "Rating", "scalar": "number", "required": False}],
            capabilities=["publishable", "rich_text_editable"],
            defaultRole="article",
            defaultPosture="structured",
            defaultSurface="writing",
        )

        page_item_id = await _create_page_item(client, project_id, title="Article Template")
        article_item_id = await _create_article_item(client, project_id, title="World v1")

        await _publish_page_template(
            client, project_id, item_id=page_item_id, title="Article Template", path="/blog/:slug"
        )
        patch_v1_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{article_item_id}/versions/draft",
            json=_article_draft_payload(expected_version=0, title="World v1", slug="world", rating=5),
        )
        assert patch_v1_res.status_code == 201, patch_v1_res.text
        await _publish_article_version(client, project_id, item_id=article_item_id, version=1)

        await _upsert_route_binding(
            client,
            project_id,
            item_id=page_item_id,
            path="/blog/:slug",
            route_mode="dynamic",
            primary_source={"modelKey": "article", "fieldKey": "slug", "paramName": "slug"},
        )
        await _publish_release(client, project_id)

        runtime_id, preview_token = await _runtime_id_and_preview_token(client, project_id)
        preview_key_res = await client.post(
            f"/api/v1/projects/{project_id}/api-keys",
            json={
                "family": "delivery",
                "name": "Preview GraphQL",
                "scopes": ["graphql.read"],
                "deliveryPerspective": "preview",
            },
        )
        assert preview_key_res.status_code == 200, preview_key_res.text
        preview_key = preview_key_res.json()["data"]["secretToken"]

        preview_draft_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{article_item_id}/versions/draft",
            json=_article_draft_payload(expected_version=1, title="World v2 draft", slug="world", rating=9),
        )
        assert preview_draft_res.status_code == 201, preview_draft_res.text

        query = """
        query ReadContent($path: String!, $slug: String!, $perspective: DeliveryPerspective!, $previewToken: String) {
          resolvePage(path: $path, perspective: $perspective, previewToken: $previewToken) {
            context {
              primary {
                title
              }
            }
            document {
              sections {
                componentKey
                props
              }
            }
          }
          articleBySlug(slug: $slug, perspective: $perspective, previewToken: $previewToken) {
            title
            slug
            content
            customFields
            revisionState
          }
        }
        """

        published_res = await _graphql(
            client,
            runtime_id,
            query=query,
            variables={"path": "/blog/world", "slug": "world", "perspective": "PUBLISHED"},
        )
        assert published_res.status_code == 200, published_res.text
        published_payload = published_res.json()
        assert "errors" not in published_payload, published_payload
        assert published_payload["data"]["resolvePage"]["context"]["primary"]["title"] == "World v1"
        assert published_payload["data"]["resolvePage"]["document"]["sections"][0]["props"]["headline"] == "World v1"
        assert published_payload["data"]["resolvePage"]["document"]["sections"][0]["props"]["rating"] == 5
        assert published_payload["data"]["articleBySlug"]["title"] == "World v1"
        assert published_payload["data"]["articleBySlug"]["content"] == "World v1 body"
        assert published_payload["data"]["articleBySlug"]["customFields"]["rating"] == 5
        assert published_payload["data"]["articleBySlug"]["revisionState"] == "published"

        preview_res = await _graphql(
            client,
            runtime_id,
            query=query,
            variables={
                "path": "/blog/world",
                "slug": "world",
                "perspective": "PREVIEW",
                "previewToken": preview_token,
            },
        )
        assert preview_res.status_code == 200, preview_res.text
        preview_payload = preview_res.json()
        assert "errors" not in preview_payload, preview_payload
        assert preview_payload["data"]["resolvePage"]["context"]["primary"]["title"] == "World v2 draft"
        assert preview_payload["data"]["resolvePage"]["document"]["sections"][0]["props"]["rating"] == 9
        assert preview_payload["data"]["articleBySlug"]["title"] == "World v2 draft"
        assert preview_payload["data"]["articleBySlug"]["customFields"]["rating"] == 9
        assert preview_payload["data"]["articleBySlug"]["revisionState"] == "draft"

        preview_key_res = await _graphql(
            client,
            runtime_id,
            query=query,
            variables={"path": "/blog/world", "slug": "world", "perspective": "PREVIEW"},
            headers={"X-API-Key": preview_key},
        )
        assert preview_key_res.status_code == 200, preview_key_res.text
        preview_key_payload = preview_key_res.json()
        assert "errors" not in preview_key_payload, preview_key_payload
        assert preview_key_payload["data"]["articleBySlug"]["title"] == "World v2 draft"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_sites_graphql_rejects_delivery_keys_without_graphql_scope(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_page_model(client, workspace_id)
        page_item_id = await _create_page_item(client, project_id, title="Landing")
        await _publish_page_template(client, project_id, item_id=page_item_id, title="Landing", path="/landing")
        await _upsert_route_binding(client, project_id, item_id=page_item_id, path="/landing")
        await _publish_release(client, project_id)

        runtime_id, _preview_token = await _runtime_id_and_preview_token(client, project_id)
        published_key_res = await client.post(
            f"/api/v1/projects/{project_id}/api-keys",
            json={
                "family": "delivery",
                "name": "Published Runtime",
                "scopes": ["delivery.read"],
                "deliveryPerspective": "published",
            },
        )
        assert published_key_res.status_code == 200, published_key_res.text
        published_key = published_key_res.json()["data"]["secretToken"]

        query = """
        query Landing($path: String!, $perspective: DeliveryPerspective!) {
          resolvePage(path: $path, perspective: $perspective) {
            document {
              path
            }
          }
        }
        """
        response = await _graphql(
            client,
            runtime_id,
            query=query,
            variables={"path": "/landing", "perspective": "PUBLISHED"},
            headers={"X-API-Key": published_key},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["data"]["resolvePage"] is None
        assert payload["errors"][0]["extensions"]["code"] == "GRAPHQL_SCOPE_REQUIRED"

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_sites_graphql_list_queries_support_filter_sort_and_pagination(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        await _create_page_model(client, workspace_id)
        await _create_content_model(
            client,
            project_id,
            key="article",
            name="Article",
            category="content_library",
            fields=[{"key": "rating", "label": "Rating", "scalar": "number", "required": False}],
            capabilities=["publishable", "rich_text_editable"],
            defaultRole="article",
            defaultPosture="structured",
            defaultSurface="writing",
        )
        await _create_content_model(
            client,
            project_id,
            key="reusable-section",
            name="Reusable Section",
            category="site_builder",
            capabilities=["publishable"],
            defaultRole="reusable-section",
            defaultPosture="composition",
            defaultSurface="structured",
        )
        await _create_content_model(
            client,
            project_id,
            key="category",
            name="Category",
            category="content_library",
            capabilities=["publishable"],
            defaultRole="taxonomy",
            defaultPosture="structured",
            defaultSurface="structured",
        )

        article_v1 = await _create_article_item(client, project_id, title="Hello world")
        article_v2 = await _create_article_item(client, project_id, title="Hello world v2")
        page_1 = await _create_generic_item(client, project_id, model_key="page", title="Alpha Page")
        page_2 = await _create_generic_item(client, project_id, model_key="page", title="Beta Page")
        section_1 = await _create_generic_item(client, project_id, model_key="reusable-section", title="Header Alpha")
        section_2 = await _create_generic_item(client, project_id, model_key="reusable-section", title="Header Beta")
        category_1 = await _create_generic_item(client, project_id, model_key="category", title="News Category")
        category_2 = await _create_generic_item(client, project_id, model_key="category", title="Docs Category")

        article_v1_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{article_v1}/versions/draft",
            json=_article_draft_payload(expected_version=0, title="Hello world", slug="hello-world", rating=5),
        )
        assert article_v1_res.status_code == 201, article_v1_res.text
        article_v2_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{article_v2}/versions/draft",
            json=_article_draft_payload(expected_version=0, title="Hello world v2", slug="hello-world", rating=9),
        )
        assert article_v2_res.status_code == 201, article_v2_res.text
        article_v2_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{article_v2}/versions/draft",
            json=_article_draft_payload(
                expected_version=1,
                title="Hello world v2",
                slug="hello-world",
                rating=10,
            ),
        )
        assert article_v2_res.status_code == 201, article_v2_res.text

        page_1_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{page_1}/versions/draft",
            json=_simple_form_draft_payload(
                expected_version=0,
                fields_snapshot={"title": "Alpha Page", "path": "/alpha"},
            ),
        )
        assert page_1_res.status_code == 201, page_1_res.text
        page_2_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{page_2}/versions/draft",
            json=_simple_form_draft_payload(
                expected_version=0,
                fields_snapshot={"title": "Beta Page", "path": "/beta"},
            ),
        )
        assert page_2_res.status_code == 201, page_2_res.text

        section_1_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{section_1}/versions/draft",
            json=_simple_form_draft_payload(
                expected_version=0,
                fields_snapshot={
                    "title": "Header Alpha",
                    "section_key": "site-header",
                    "props_defaults": {"tone": "primary"},
                },
            ),
        )
        assert section_1_res.status_code == 201, section_1_res.text
        section_2_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{section_2}/versions/draft",
            json=_simple_form_draft_payload(
                expected_version=0,
                fields_snapshot={
                    "title": "Header Beta",
                    "section_key": "site-footer",
                    "props_defaults": {"tone": "secondary"},
                },
            ),
        )
        assert section_2_res.status_code == 201, section_2_res.text

        category_1_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{category_1}/versions/draft",
            json=_simple_form_draft_payload(
                expected_version=0,
                fields_snapshot={"name": "News Category", "slug": "news", "description": "News"},
            ),
        )
        assert category_1_res.status_code == 201, category_1_res.text
        category_2_res = await client.post(
            f"/api/v1/projects/{project_id}/content/items/{category_2}/versions/draft",
            json=_simple_form_draft_payload(
                expected_version=0,
                fields_snapshot={"name": "Docs Category", "slug": "docs", "description": "Docs"},
            ),
        )
        assert category_2_res.status_code == 201, category_2_res.text

        runtime_id, preview_token = await _runtime_id_and_preview_token(client, project_id)
        query = """
        query ListContent(
          $perspective: DeliveryPerspective!,
          $previewToken: String,
          $articleFilter: ArticleFilterInput,
          $articleSort: ArticleSortInput,
          $pageFilter: PageFilterInput,
          $pageSort: PageSortInput,
          $sectionFilter: ReusableSectionFilterInput,
          $sectionSort: ReusableSectionSortInput,
          $categoryFilter: CategoryFilterInput,
          $categorySort: CategorySortInput
        ) {
          articleEntries: articles(
            perspective: $perspective,
            previewToken: $previewToken,
            filter: $articleFilter,
            sort: $articleSort,
            limit: 1,
            offset: 0
          ) {
            title
            slug
            revision
          }
          pages(
            perspective: $perspective,
            previewToken: $previewToken,
            filter: $pageFilter,
            sort: $pageSort,
            limit: 5,
            offset: 0
          ) {
            title
            path
          }
          reusableSections(
            perspective: $perspective,
            previewToken: $previewToken,
            filter: $sectionFilter,
            sort: $sectionSort,
            limit: 5,
            offset: 0
          ) {
            title
            sectionKey
          }
          categories(
            perspective: $perspective,
            previewToken: $previewToken,
            filter: $categoryFilter,
            sort: $categorySort,
            limit: 5,
            offset: 0
          ) {
            name
            slug
          }
        }
        """

        response = await _graphql(
            client,
            runtime_id,
            query=query,
            variables={
                "perspective": "PREVIEW",
                "previewToken": preview_token,
                "articleFilter": {"slug": "hello-world"},
                "articleSort": {"field": "REVISION", "direction": "DESC"},
                "pageFilter": {"path": "/beta"},
                "pageSort": {"field": "TITLE", "direction": "ASC"},
                "sectionFilter": {"sectionKey": "site-header"},
                "sectionSort": {"field": "SECTION_KEY", "direction": "ASC"},
                "categoryFilter": {"slug": "news"},
                "categorySort": {"field": "NAME", "direction": "ASC"},
            },
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert "errors" not in payload, payload
        assert payload["data"]["articleEntries"] == [{"title": "Hello world v2", "slug": "hello-world", "revision": 2}]
        assert payload["data"]["pages"] == [{"title": "Beta Page", "path": "/beta"}]
        assert payload["data"]["reusableSections"] == [{"title": "Header Alpha", "sectionKey": "site-header"}]
        assert payload["data"]["categories"] == [{"name": "News Category", "slug": "news"}]

    get_settings.cache_clear()
