from __future__ import annotations

from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.config import SearchSettings, Settings
from src.core.exceptions import ServiceUnavailable
from src.modules.sites.graphql.service import StructuredContentRecord
from src.modules.sites.search.backend import MemoryContentSearchBackend
from src.modules.sites.search.service import ContentSearchService
from tests.core.test_api_boundary_routes_unit import _runtime_context


def _record(*, title: str, locale: str = "en-US", fields: JsonObject | None = None) -> StructuredContentRecord:
    default_fields: JsonObject = {"title": title, "body": "Searchable public body"}
    resolved_fields = fields if fields is not None else default_fields
    return StructuredContentRecord(
        item_id=uuid4(),
        translation_group_id=None,
        model_key="article",
        locale=locale,
        title=title,
        slug=title.lower().replace(" ", "-"),
        revision=2,
        revision_state="published",
        draft_revision=2,
        published_revision=2,
        fields=resolved_fields,
        custom_fields=resolved_fields,
        route_path=f"/blog/{title.lower().replace(' ', '-')}",
        route_contract={"modelKey": "article"},
    )


@pytest.mark.asyncio
async def test_content_search_indexes_queries_filters_and_removes_documents() -> None:
    runtime_context = _runtime_context(runtime_id=uuid4(), site_id=uuid4())
    backend = MemoryContentSearchBackend()
    service = ContentSearchService(
        Settings(search=SearchSettings(enabled=True, backend="memory")),
        backend=backend,
    )
    english = _record(title="World Launch", fields={"title": "World Launch", "body": "Alpha roadmap"})
    chinese = _record(title="World Launch CN", locale="zh-CN", fields={"title": "World Launch", "body": "中文"})

    await service.replace_records(runtime_context=runtime_context, model_key="article", records=[english, chinese])

    all_hits = await service.search_published(
        runtime_context=runtime_context,
        model_key="article",
        query="world",
        locale=None,
        limit=20,
        offset=0,
    )
    assert all_hits.total == 2
    assert {item.locale for item in all_hits.items} == {"en-US", "zh-CN"}

    locale_hits = await service.search_published(
        runtime_context=runtime_context,
        model_key="article",
        query="roadmap",
        locale="en-US",
        limit=20,
        offset=0,
    )
    assert locale_hits.total == 1
    assert locale_hits.items[0].fields == {"title": "World Launch", "body": "Alpha roadmap"}

    await service.remove_items(runtime_context=runtime_context, item_ids=[english.item_id])
    removed_hits = await service.search_published(
        runtime_context=runtime_context,
        model_key="article",
        query="roadmap",
        locale=None,
        limit=20,
        offset=0,
    )
    assert removed_hits.total == 0


@pytest.mark.asyncio
async def test_disabled_content_search_raises_visible_error() -> None:
    service = ContentSearchService(Settings(search=SearchSettings(enabled=False)))

    with pytest.raises(ServiceUnavailable) as exc:
        await service.search_published(
            runtime_context=_runtime_context(runtime_id=uuid4(), site_id=uuid4()),
            model_key="article",
            query="world",
            locale=None,
            limit=20,
            offset=0,
        )

    assert exc.value.error == "SEARCH_DISABLED"
