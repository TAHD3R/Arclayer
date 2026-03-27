from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from apps.api.src.core.exceptions import NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.models.content.component_binding import ComponentBindingRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.seo_profile import SEOProfileRecord
from apps.api.src.modules.workspaces.content.contracts.schema import (
    ContentComponentBindingOut,
    ContentItemOut,
    ContentPresentationOut,
    ContentSeoProfileOut,
    ContentVersionOut,
)
from apps.api.src.modules.workspaces.content.items.domain_helpers import to_item_out, to_version_out
from apps.api.src.modules.workspaces.content.items.repository import WorkspaceContentItemsRepository


class WorkspaceContentCanonicalItemReadService:
    def __init__(self, repo: WorkspaceContentItemsRepository) -> None:
        self.repo = repo

    async def list_items_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
        model_key: str | None,
    ) -> PageData[ContentItemOut]:
        model_definition_id: UUID | None = None
        if model_key is not None:
            model = await self.repo.get_model_definition_by_key(
                workspace_id=workspace_id,
                site_id=site_id,
                model_key=model_key,
            )
            if model is None:
                raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
            model_definition_id = model.id

        items = await self.repo.list_items(
            workspace_id=workspace_id,
            site_id=site_id,
            model_definition_id=model_definition_id,
        )
        rows = [to_item_out(item, item.model_definition) for item in items]
        return paginate_items(rows, params=params)

    @staticmethod
    def _to_presentation_outs(presentations: list[tuple[str, dict | None]]) -> list[ContentPresentationOut]:
        return [ContentPresentationOut(kind=kind, payload=payload) for kind, payload in presentations]

    @staticmethod
    def _to_binding_out(record: ComponentBindingRecord) -> ContentComponentBindingOut:
        payload = record.binding_payload if isinstance(record.binding_payload, dict) else None
        return ContentComponentBindingOut(
            component_key=record.component_key,
            binding_key=record.binding_key,
            binding_payload=payload,
            sort_order=record.sort_order,
        )

    @staticmethod
    def _to_seo_out(record: SEOProfileRecord) -> ContentSeoProfileOut:
        payload = record.payload if isinstance(record.payload, dict) else None
        return ContentSeoProfileOut(
            meta_title=record.meta_title,
            meta_description=record.meta_description,
            canonical_url=record.canonical_url,
            robots_directive=record.robots_directive,
            payload=payload,
        )

    async def build_version_out(
        self,
        *,
        version: ContentVersionRecord,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentVersionOut:
        presentations = await self.repo.list_presentations(version_id=version.id, conn=conn)
        normalized = [(presentation.kind, presentation.payload) for presentation in presentations]
        return to_version_out(version, normalized)

    async def _get_item_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
    ) -> ContentVersionRecord:
        item = await self.repo.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
        )
        if item is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        version = await self.repo.get_version_by_number(item_id=item.id, version_number=version_number)
        if version is None:
            raise NotFound("Content version not found", error="CONTENT_ITEM_VERSION_NOT_FOUND")
        return version

    async def get_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
    ) -> ContentVersionOut:
        version = await self._get_item_version(
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            version_number=version_number,
        )
        return await self.build_version_out(version=version)

    async def list_presentations(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
    ) -> list[ContentPresentationOut]:
        version = await self._get_item_version(
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            version_number=version_number,
        )
        presentations = await self.repo.list_presentations(version_id=version.id)
        normalized = [(presentation.kind, presentation.payload) for presentation in presentations]
        return self._to_presentation_outs(normalized)

    async def get_seo_profile(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
    ) -> ContentSeoProfileOut:
        version = await self._get_item_version(
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            version_number=version_number,
        )
        seo_profile = await self.repo.get_seo_profile(version_id=version.id)
        if seo_profile is None:
            raise NotFound("SEO profile not found", error="CONTENT_VERSION_SEO_NOT_FOUND")
        return self._to_seo_out(seo_profile)

    async def list_component_bindings(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
    ) -> list[ContentComponentBindingOut]:
        version = await self._get_item_version(
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            version_number=version_number,
        )
        bindings = await self.repo.list_component_bindings(version_id=version.id)
        return [self._to_binding_out(binding) for binding in bindings]
