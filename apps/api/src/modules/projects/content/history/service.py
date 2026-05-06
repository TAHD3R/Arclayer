from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams, paginate_items
from src.core.services import BaseService
from src.modules.projects.content.contracts.schema import ContentPresentationKind, ContentVersionOut
from src.modules.projects.content.items.domain_helpers import to_version_out

if TYPE_CHECKING:
    from src.models.content.content_item import ContentItemRecord
    from src.models.content.content_version import ContentVersionRecord
    from src.modules.projects.content.items.repository import ProjectContentItemsRepository


class ContentPublishedReadModel(BaseModel):
    model_config = ConfigDict(frozen=True)
    current_version_number: int | None
    has_published_version: bool


class ContentPreviewDiagnosticsReadModel(BaseModel):
    model_config = ConfigDict(frozen=True)
    current_draft_version_number: int
    current_published_version_number: int | None
    has_unpublished_changes: bool


class ContentVersionSystemObject(BaseModel):
    model_config = ConfigDict(frozen=True)
    version: object
    presentations: list[tuple[ContentPresentationKind, dict[str, Any] | None]] = Field(default_factory=list)

    def to_contract(self) -> ContentVersionOut:
        return to_version_out(cast("ContentVersionRecord", self.version), self.presentations)


class ContentVersionSystemObjectList(BaseModel):
    model_config = ConfigDict(frozen=True)
    items: list[ContentVersionSystemObject]

    def to_contract_page(self, *, params: PageParams) -> PageData[ContentVersionOut]:
        rows = [item.to_contract() for item in self.items]
        return paginate_items(rows, params=params)


class ContentHistoryService(BaseService):
    def __init__(self, repo: ProjectContentItemsRepository) -> None:
        super().__init__()
        self.repo = repo

    async def get_item_or_raise(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None = None,
        item_id: UUID,
    ) -> ContentItemRecord:
        item = await self.repo.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
        )
        if item is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        return item

    async def get_version_or_raise(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None = None,
        item_id: UUID,
        version_number: int,
    ) -> ContentVersionSystemObject:
        item = await self.get_item_or_raise(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
        )
        version = await self.repo.get_version_by_number(item_id=item.id, version_number=version_number)
        if version is None:
            raise NotFound("Content version not found", error="CONTENT_ITEM_VERSION_NOT_FOUND")
        return await self.build_version_system_object(version=version)

    async def list_versions(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None = None,
        item_id: UUID,
    ) -> ContentVersionSystemObjectList:
        item = await self.get_item_or_raise(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
        )
        versions = await self.repo.list_versions_for_item(item_id=item.id)
        items = [await self.build_version_system_object(version=version) for version in versions]
        return ContentVersionSystemObjectList(items=items)

    async def build_version_system_object(
        self,
        *,
        version: ContentVersionRecord,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentVersionSystemObject:
        hydrated_version = await self.repo.get_version_by_id_with_model(version_id=version.id, conn=conn)
        if hydrated_version is not None:
            version = hydrated_version
        presentations = await self.repo.list_presentations(version_id=version.id, conn=conn)
        normalized = cast(
            list[tuple[ContentPresentationKind, dict[str, Any] | None]],
            [
                (
                    presentation.kind,
                    presentation.payload if isinstance(presentation.payload, dict) else None,
                )
                for presentation in presentations
            ],
        )
        return ContentVersionSystemObject(version=version, presentations=normalized)
