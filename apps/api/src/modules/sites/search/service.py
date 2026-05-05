from __future__ import annotations

import re
from collections.abc import Iterable
from uuid import UUID

from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.services import BaseService
from src.modules.projects.runtime.service import ProjectRuntimeContext, ProjectRuntimeService
from src.modules.sites.graphql.planner import list_graphql_query_rules
from src.modules.sites.graphql.service import SiteGraphQLService, StructuredContentRecord
from src.modules.sites.repository import SitesRepository
from src.modules.sites.search.backend import ContentSearchBackend, build_content_search_backend
from src.modules.sites.search.schema import (
    ContentSearchDocument,
    ContentSearchHitOut,
    ContentSearchQuery,
    ContentSearchResultOut,
)
from src.modules.tenancy.database import TenantDatabaseRouter

_INDEX_TOKEN_PATTERN = re.compile(r"[^a-zA-Z0-9_-]+")


class ContentSearchService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        backend: ContentSearchBackend | None = None,
        repo: SitesRepository | None = None,
        query_service: SiteGraphQLService | None = None,
        runtime_service: ProjectRuntimeService | None = None,
    ) -> None:
        super().__init__(settings)
        self._settings = settings
        self._backend = backend or build_content_search_backend(settings.search)
        self._repo = repo or SitesRepository()
        self._query_service = query_service or SiteGraphQLService(settings)
        self._runtime_service = runtime_service or ProjectRuntimeService(settings)

    @property
    def enabled(self) -> bool:
        return self._settings.search.enabled

    async def search_published(
        self,
        *,
        runtime_context: ProjectRuntimeContext,
        model_key: str,
        query: str,
        locale: str | None,
        limit: int,
        offset: int,
    ) -> ContentSearchResultOut:
        normalized_model_key = self._normalize_model_key(model_key)
        normalized_query = self._normalize_query(query)
        normalized_locale = _normalize_optional_text(locale)
        result = await self._backend.search(
            index_uid=self._index_uid(site_id=runtime_context.site_id, model_key=normalized_model_key),
            query=ContentSearchQuery(
                runtime_id=runtime_context.runtime_id,
                site_id=runtime_context.site_id,
                model_key=normalized_model_key,
                query=normalized_query,
                locale=normalized_locale,
                limit=limit,
                offset=offset,
            ),
        )
        return ContentSearchResultOut(
            model_key=normalized_model_key,
            locale=normalized_locale,
            query=normalized_query,
            total=result.total,
            limit=limit,
            offset=offset,
            items=[_document_to_hit(document) for document in result.hits],
        )

    async def reindex_runtime(
        self,
        *,
        runtime_context: ProjectRuntimeContext,
        query_service: SiteGraphQLService | None = None,
    ) -> None:
        for model_key in sorted(list_graphql_query_rules()):
            await self.reindex_model(runtime_context=runtime_context, model_key=model_key, query_service=query_service)

    async def reindex_model(
        self,
        *,
        runtime_context: ProjectRuntimeContext,
        model_key: str,
        query_service: SiteGraphQLService | None = None,
    ) -> None:
        normalized_model_key = self._normalize_model_key(model_key)
        service = query_service or self._query_service
        async with TenantDatabaseRouter(runtime_context.tenant_context).connection() as conn:
            records = await service.with_database_connection(conn).list_records(
                runtime_id=runtime_context.runtime_id,
                model_key=normalized_model_key,
                perspective="published",
                environment_id=None,
            )
        await self.replace_records(runtime_context=runtime_context, model_key=normalized_model_key, records=records)

    async def replace_records(
        self,
        *,
        runtime_context: ProjectRuntimeContext,
        model_key: str,
        records: Iterable[StructuredContentRecord],
    ) -> None:
        normalized_model_key = self._normalize_model_key(model_key)
        index_uid = self._index_uid(site_id=runtime_context.site_id, model_key=normalized_model_key)
        await self._backend.configure_index(index_uid=index_uid)
        await self._backend.replace_documents(
            index_uid=index_uid,
            documents=[
                _record_to_document(runtime_context=runtime_context, record=record)
                for record in records
                if record.model_key == normalized_model_key and record.published_revision is not None
            ],
        )

    async def remove_items(
        self,
        *,
        runtime_context: ProjectRuntimeContext,
        item_ids: Iterable[UUID | str],
    ) -> None:
        document_ids = [str(item_id) for item_id in item_ids]
        if not document_ids:
            return
        for model_key in sorted(list_graphql_query_rules()):
            await self._backend.delete_documents(
                index_uid=self._index_uid(site_id=runtime_context.site_id, model_key=model_key),
                document_ids=document_ids,
            )

    async def remove_item_from_site_models(self, *, site_id: UUID, item_id: UUID) -> None:
        for model_key in sorted(list_graphql_query_rules()):
            await self._backend.delete_documents(
                index_uid=self._index_uid(site_id=site_id, model_key=model_key),
                document_ids=[str(item_id)],
            )

    async def runtime_context_for_site(self, *, site_id: UUID) -> ProjectRuntimeContext:
        site = await self._repo.get_site_by_id(site_id=site_id)
        return await self._runtime_service.get_context_by_runtime(
            runtime_id=UUID(str(site.runtime_id)),
            actor_user_id=None,
        )

    def _index_uid(self, *, site_id: UUID, model_key: str) -> str:
        prefix = _safe_index_token(self._settings.search.index_prefix)
        site = site_id.hex
        model = _safe_index_token(model_key)
        return f"{prefix}_{site}_{model}"

    @staticmethod
    def _normalize_model_key(model_key: str) -> str:
        normalized = model_key.strip()
        if normalized not in list_graphql_query_rules():
            raise BadRequest(
                "Content search model is not allowed",
                error="CONTENT_SEARCH_MODEL_FORBIDDEN",
                meta={"modelKey": normalized, "allowedModels": sorted(list_graphql_query_rules())},
            )
        return normalized

    @staticmethod
    def _normalize_query(query: str) -> str:
        normalized = query.strip()
        if not normalized:
            raise BadRequest("Content search query is required", error="CONTENT_SEARCH_QUERY_REQUIRED")
        return normalized


def _record_to_document(
    *, runtime_context: ProjectRuntimeContext, record: StructuredContentRecord
) -> ContentSearchDocument:
    return ContentSearchDocument(
        id=str(record.item_id),
        item_id=record.item_id,
        runtime_id=runtime_context.runtime_id,
        site_id=runtime_context.site_id,
        model_key=record.model_key,
        locale=record.locale,
        title=record.title,
        slug=record.slug,
        revision=record.revision,
        draft_revision=record.draft_revision,
        published_revision=record.published_revision or record.revision,
        fields=record.fields,
        custom_fields=record.custom_fields,
        route_path=record.route_path,
        route_contract=record.route_contract,
    )


def _document_to_hit(document: ContentSearchDocument) -> ContentSearchHitOut:
    return ContentSearchHitOut(
        id=document.item_id,
        model_key=document.model_key,
        locale=document.locale,
        title=document.title,
        slug=document.slug,
        revision=document.revision,
        draft_revision=document.draft_revision,
        published_revision=document.published_revision,
        fields=document.fields,
        custom_fields=document.custom_fields,
        route_path=document.route_path,
        route_contract=document.route_contract,
    )


def _normalize_optional_text(value: str | None) -> str | None:
    normalized = value.strip() if isinstance(value, str) else ""
    return normalized or None


def _safe_index_token(value: str) -> str:
    return _INDEX_TOKEN_PATTERN.sub("_", value.strip()).strip("_") or "content"
