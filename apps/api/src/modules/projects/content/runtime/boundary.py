from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.modules.projects.content.items.domain_helpers import (
    read_slug_field,
    read_summary_field,
    read_title_field,
    read_visibility_field,
)

if TYPE_CHECKING:
    from src.modules.projects.content.items.repository import ProjectContentItemsRepository


class DocumentRuntimeItemFields(BaseModel):
    model_config = ConfigDict(frozen=True)
    title: str | None = None
    slug: str | None = None
    summary: str | None = None
    visibility: str | None = None


class DocumentPublishedReadModel(BaseModel):
    model_config = ConfigDict(frozen=True)
    current_version_number: int | None
    has_published_version: bool


class DocumentPreviewDiagnosticsReadModel(BaseModel):
    model_config = ConfigDict(frozen=True)
    current_draft_version_number: int
    current_published_version_number: int | None
    has_unpublished_changes: bool


class DocumentRuntimeMetadata(BaseModel):
    model_config = ConfigDict(frozen=True)
    route_path: str | None = None
    route_contract: dict[str, Any] | None = None
    binding_key: str | None = None
    protocol_key: str | None = None


class DocumentQueryRecord(BaseModel):
    model_config = ConfigDict(frozen=True)
    item: Any
    revision: int
    revision_state: str
    fields: dict[str, Any]
    metadata: DocumentRuntimeMetadata = Field(default_factory=DocumentRuntimeMetadata)


class DocumentQuery(BaseModel):
    model_config = ConfigDict(frozen=True)
    site_id: UUID
    model_key: str
    perspective: str
    protocol_key: str | None = None
    status: str | None = None
    route_path: str | None = None
    binding_key: str | None = None


class DocumentQueryResult(BaseModel):
    records: list[DocumentQueryRecord]


class DocumentQueryBoundary(BaseModel):
    model_config = ConfigDict(frozen=True)
    records: list[DocumentQueryRecord]

    def execute(self, query: DocumentQuery) -> DocumentQueryResult:
        records = [
            record
            for record in self.records
            if record.item.site_id == query.site_id
            and str(record.item.model_definition.singular_key if record.item.model_definition is not None else "")
            == query.model_key
            and (query.protocol_key is None or record.metadata.protocol_key == query.protocol_key)
            and (query.status is None or record.revision_state == query.status)
            and (query.route_path is None or record.metadata.route_path == query.route_path)
            and (query.binding_key is None or record.metadata.binding_key == query.binding_key)
        ]
        return DocumentQueryResult(records=records)


class DocumentReadContext:
    repo: ProjectContentItemsRepository

    def __init__(self, *, repo: ProjectContentItemsRepository) -> None:
        self.repo = repo

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


class DocumentMutationContext:  # noqa: B903 - runtime service context; dataclass is production-banned.
    repo: ProjectContentItemsRepository

    def __init__(self, *, repo: ProjectContentItemsRepository) -> None:
        self.repo = repo


class DocumentRuntimeBoundary:
    reads: DocumentReadContext
    mutations: DocumentMutationContext

    def __init__(self, *, reads: DocumentReadContext, mutations: DocumentMutationContext) -> None:
        self.reads = reads
        self.mutations = mutations

    @classmethod
    def for_items_repo(cls, repo: ProjectContentItemsRepository) -> DocumentRuntimeBoundary:
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
