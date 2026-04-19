from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any
from uuid import UUID

from src.modules.workspaces.content.items.domain_helpers import (
    read_slug_field,
    read_summary_field,
    read_title_field,
    read_visibility_field,
)

if TYPE_CHECKING:
    from src.modules.workspaces.content.items.repository import WorkspaceContentItemsRepository


@dataclass(frozen=True)
class DocumentRuntimeItemFields:
    title: str | None = None
    slug: str | None = None
    summary: str | None = None
    visibility: str | None = None


@dataclass(frozen=True)
class DocumentPublishedReadModel:
    current_version_number: int | None
    has_published_version: bool


@dataclass(frozen=True)
class DocumentPreviewDiagnosticsReadModel:
    current_draft_version_number: int
    current_published_version_number: int | None
    has_unpublished_changes: bool


@dataclass(frozen=True)
class DocumentRuntimeMetadata:
    route_path: str | None = None
    route_contract: dict[str, Any] | None = None
    binding_key: str | None = None
    protocol_key: str | None = None


@dataclass(frozen=True)
class DocumentQueryRecord:
    item: Any
    revision: int
    revision_state: str
    fields: dict[str, Any]
    metadata: DocumentRuntimeMetadata = field(default_factory=DocumentRuntimeMetadata)


@dataclass(frozen=True)
class DocumentQuery:
    site_id: UUID
    model_key: str
    perspective: str
    protocol_key: str | None = None
    status: str | None = None
    route_path: str | None = None
    binding_key: str | None = None


@dataclass(frozen=True)
class DocumentQueryResult:
    records: list[DocumentQueryRecord]


@dataclass(frozen=True)
class DocumentQueryBoundary:
    records: list[DocumentQueryRecord]

    def execute(self, query: DocumentQuery) -> DocumentQueryResult:
        records = [
            record
            for record in self.records
            if record.item.site_id == query.site_id
            and str(record.item.model_definition.key if record.item.model_definition is not None else "")
            == query.model_key
            and (query.protocol_key is None or record.metadata.protocol_key == query.protocol_key)
            and (query.status is None or record.revision_state == query.status)
            and (query.route_path is None or record.metadata.route_path == query.route_path)
            and (query.binding_key is None or record.metadata.binding_key == query.binding_key)
        ]
        return DocumentQueryResult(records=records)


@dataclass(frozen=True)
class DocumentReadContext:
    repo: WorkspaceContentItemsRepository

    async def resolve_active_item_fields(self, items: list[Any]) -> dict[UUID, DocumentRuntimeItemFields]:
        active_versions: dict[UUID, int] = {}
        for item in items:
            active_version = item.draft_version or item.published_version
            if active_version:
                active_versions[item.id] = active_version

        if not active_versions:
            return {}

        versions = await self.repo.list_versions_for_items(
            item_ids=list(active_versions.keys()),
            version_numbers=list(set(active_versions.values())),
        )
        fields_by_version = {
            (version.item_id, version.version): DocumentRuntimeItemFields(
                title=read_title_field(version.fields_snapshot),
                summary=read_summary_field(version.fields_snapshot),
                slug=read_slug_field(version.fields_snapshot),
                visibility=read_visibility_field(version.fields_snapshot),
            )
            for version in versions
        }
        return {
            item_id: fields_by_version.get((item_id, version_number), DocumentRuntimeItemFields())
            for item_id, version_number in active_versions.items()
        }

    def resolve_published_read_model(self, item: Any) -> DocumentPublishedReadModel:
        published_version = item.published_version if item.published_version is not None else None
        return DocumentPublishedReadModel(
            current_version_number=published_version,
            has_published_version=published_version is not None,
        )

    def resolve_preview_diagnostics(self, item: Any) -> DocumentPreviewDiagnosticsReadModel:
        published_version = item.published_version if item.published_version is not None else None
        draft_version = int(item.draft_version or 0)
        return DocumentPreviewDiagnosticsReadModel(
            current_draft_version_number=draft_version,
            current_published_version_number=published_version,
            has_unpublished_changes=published_version is None or draft_version > published_version,
        )


@dataclass(frozen=True)
class DocumentMutationContext:
    repo: WorkspaceContentItemsRepository


@dataclass(frozen=True)
class DocumentFacade:
    reads: DocumentReadContext
    mutations: DocumentMutationContext

    @classmethod
    def for_items_repo(cls, repo: WorkspaceContentItemsRepository) -> DocumentFacade:
        return cls(
            reads=DocumentReadContext(repo=repo),
            mutations=DocumentMutationContext(repo=repo),
        )

    async def resolve_active_item_fields(self, items: list[Any]) -> dict[UUID, DocumentRuntimeItemFields]:
        return await self.reads.resolve_active_item_fields(items)

    def resolve_published_read_model(self, item: Any) -> DocumentPublishedReadModel:
        return self.reads.resolve_published_read_model(item)

    def resolve_preview_diagnostics(self, item: Any) -> DocumentPreviewDiagnosticsReadModel:
        return self.reads.resolve_preview_diagnostics(item)

    def build_query_boundary(self, records: list[DocumentQueryRecord]) -> DocumentQueryBoundary:
        return DocumentQueryBoundary(records=records)
