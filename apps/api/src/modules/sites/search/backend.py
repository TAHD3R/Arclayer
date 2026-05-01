from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Any

import httpx

from src.config import SearchSettings
from src.core.exceptions import ServiceUnavailable
from src.modules.sites.search.schema import ContentSearchDocument, ContentSearchQuery, ContentSearchResult

SEARCHABLE_ATTRIBUTES = ["title", "slug", "fields", "customFields", "routePath"]
FILTERABLE_ATTRIBUTES = ["runtimeId", "siteId", "modelKey", "locale", "publishedRevision"]
SORTABLE_ATTRIBUTES = ["revision", "title"]


class ContentSearchBackend(ABC):
    @abstractmethod
    async def configure_index(self, *, index_uid: str) -> None: ...

    @abstractmethod
    async def replace_documents(self, *, index_uid: str, documents: list[ContentSearchDocument]) -> None: ...

    @abstractmethod
    async def delete_documents(self, *, index_uid: str, document_ids: list[str]) -> None: ...

    @abstractmethod
    async def search(self, *, index_uid: str, query: ContentSearchQuery) -> ContentSearchResult: ...


class DisabledContentSearchBackend(ContentSearchBackend):
    async def configure_index(self, *, index_uid: str) -> None:
        raise ServiceUnavailable("Search is disabled", error="SEARCH_DISABLED")

    async def replace_documents(self, *, index_uid: str, documents: list[ContentSearchDocument]) -> None:
        raise ServiceUnavailable("Search is disabled", error="SEARCH_DISABLED")

    async def delete_documents(self, *, index_uid: str, document_ids: list[str]) -> None:
        raise ServiceUnavailable("Search is disabled", error="SEARCH_DISABLED")

    async def search(self, *, index_uid: str, query: ContentSearchQuery) -> ContentSearchResult:
        raise ServiceUnavailable("Search is disabled", error="SEARCH_DISABLED")


class MemoryContentSearchBackend(ContentSearchBackend):
    def __init__(self) -> None:
        self._indexes: dict[str, dict[str, ContentSearchDocument]] = defaultdict(dict)

    async def configure_index(self, *, index_uid: str) -> None:
        self._indexes.setdefault(index_uid, {})

    async def replace_documents(self, *, index_uid: str, documents: list[ContentSearchDocument]) -> None:
        index = self._indexes.setdefault(index_uid, {})
        for document in documents:
            index[document.id] = document

    async def delete_documents(self, *, index_uid: str, document_ids: list[str]) -> None:
        index = self._indexes.setdefault(index_uid, {})
        for document_id in document_ids:
            index.pop(document_id, None)

    async def search(self, *, index_uid: str, query: ContentSearchQuery) -> ContentSearchResult:
        needle = query.query.strip().lower()
        if not needle:
            return ContentSearchResult(total=0, hits=[])
        hits = [
            document
            for document in self._indexes.get(index_uid, {}).values()
            if document.runtime_id == query.runtime_id
            and document.site_id == query.site_id
            and document.model_key == query.model_key
            and (query.locale is None or document.locale == query.locale)
            and _document_contains(document, needle)
        ]
        hits.sort(key=lambda document: (document.title or "", document.id))
        return ContentSearchResult(total=len(hits), hits=hits[query.offset : query.offset + query.limit])


class MeilisearchContentSearchBackend(ContentSearchBackend):
    def __init__(self, settings: SearchSettings) -> None:
        self._settings = settings
        self._base_url = settings.meilisearch_url.rstrip("/")
        self._api_key = settings.meilisearch_api_key.get_secret_value()

    async def configure_index(self, *, index_uid: str) -> None:
        await self._request("put", f"/indexes/{index_uid}", json={"uid": index_uid, "primaryKey": "id"})
        await self._request(
            "patch",
            f"/indexes/{index_uid}/settings",
            json={
                "searchableAttributes": SEARCHABLE_ATTRIBUTES,
                "filterableAttributes": FILTERABLE_ATTRIBUTES,
                "sortableAttributes": SORTABLE_ATTRIBUTES,
            },
        )

    async def replace_documents(self, *, index_uid: str, documents: list[ContentSearchDocument]) -> None:
        if not documents:
            return
        await self._request(
            "post",
            f"/indexes/{index_uid}/documents",
            params={"primaryKey": "id"},
            json=[document.model_dump(mode="json", by_alias=True) for document in documents],
        )

    async def delete_documents(self, *, index_uid: str, document_ids: list[str]) -> None:
        for document_id in document_ids:
            await self._request("delete", f"/indexes/{index_uid}/documents/{document_id}")

    async def search(self, *, index_uid: str, query: ContentSearchQuery) -> ContentSearchResult:
        filters = [
            _meili_eq("runtimeId", str(query.runtime_id)),
            _meili_eq("siteId", str(query.site_id)),
            _meili_eq("modelKey", query.model_key),
        ]
        if query.locale is not None:
            filters.append(_meili_eq("locale", query.locale))
        payload: dict[str, Any] = {
            "q": query.query,
            "filter": filters,
            "limit": query.limit,
            "offset": query.offset,
        }
        response = await self._request("post", f"/indexes/{index_uid}/search", json=payload)
        hits = [ContentSearchDocument.model_validate(hit) for hit in response.get("hits", [])]
        total = int(response.get("estimatedTotalHits") or response.get("totalHits") or len(hits))
        return ContentSearchResult(total=total, hits=hits)

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._api_key}"} if self._api_key else {}
        try:
            async with httpx.AsyncClient(timeout=self._settings.request_timeout_seconds) as client:
                response = await client.request(method, f"{self._base_url}{path}", headers=headers, **kwargs)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ServiceUnavailable("Search backend request failed", error="SEARCH_BACKEND_UNAVAILABLE") from exc
        if not response.content:
            return {}
        payload = response.json()
        return payload if isinstance(payload, dict) else {}


def build_content_search_backend(settings: SearchSettings) -> ContentSearchBackend:
    if not settings.enabled:
        return DisabledContentSearchBackend()
    if settings.backend == "memory":
        return MemoryContentSearchBackend()
    return MeilisearchContentSearchBackend(settings)


def _document_contains(document: ContentSearchDocument, needle: str) -> bool:
    haystack = " ".join(_flatten_values(document.model_dump(mode="json")))
    return needle in haystack.lower()


def _flatten_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (str, int, float, bool)):
        return [str(value)]
    if isinstance(value, list):
        return [item for nested in value for item in _flatten_values(nested)]
    if isinstance(value, dict):
        return [item for nested in value.values() for item in _flatten_values(nested)]
    return [str(value)]


def _meili_eq(field: str, value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'{field} = "{escaped}"'
