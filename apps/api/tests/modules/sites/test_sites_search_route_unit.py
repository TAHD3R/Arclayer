from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.registry import create_app
from src.modules.projects.runtime.router import get_runtime_context
from src.modules.sites.graphql.service import StructuredContentRecord
from src.modules.sites.search.backend import MemoryContentSearchBackend
from src.modules.sites.search.deps import get_content_search_service
from src.modules.sites.search.service import ContentSearchService
from tests.core.test_api_boundary_routes_unit import _runtime_context
from tests.utils.asgi_client import asgi_client


@pytest.mark.asyncio
async def test_content_api_search_route_uses_indexed_delivery_safe_documents(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE__ENABLED", "0")
    monkeypatch.setenv("VALKEY__ENABLED", "0")
    get_settings.cache_clear()

    runtime_id = uuid4()
    runtime_context = _runtime_context(runtime_id=runtime_id, site_id=uuid4())
    settings = get_settings()
    search_service = ContentSearchService(
        settings.model_copy(
            update={"search": settings.search.model_copy(update={"enabled": True, "backend": "memory"})}
        ),
        backend=MemoryContentSearchBackend(),
    )
    await search_service.replace_records(
        runtime_context=runtime_context,
        model_key="article",
        records=[
            StructuredContentRecord(
                item_id=uuid4(),
                model_key="article",
                locale="en-US",
                title="Searchable delivery entry",
                slug="searchable-delivery-entry",
                revision=3,
                revision_state="published",
                draft_revision=4,
                published_revision=3,
                fields={"title": "Searchable delivery entry", "body": "public body"},
                custom_fields={"body": "public body"},
                route_path="/blog/searchable-delivery-entry",
                route_contract={"modelKey": "article"},
            )
        ],
    )
    app = create_app()
    app.dependency_overrides[get_runtime_context] = lambda: runtime_context
    app.dependency_overrides[get_content_search_service] = lambda: search_service

    async with asgi_client(app) as client:
        response = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/search",
            params={"modelKey": "article", "q": "delivery", "locale": "en-US"},
        )

    assert response.status_code == 200, response.text
    payload = response.json()["data"]
    assert payload["total"] == 1
    assert payload["items"][0]["title"] == "Searchable delivery entry"
    assert payload["items"][0]["fields"] == {"title": "Searchable delivery entry", "body": "public body"}
    get_settings.cache_clear()
