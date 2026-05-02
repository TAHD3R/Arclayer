from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams, paginate_items
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.modules.projects.content.contracts.schema import (
    ContentComponentBindingOut,
    ContentItemOut,
    ContentPresentationKind,
    ContentPresentationOut,
    ContentSeoProfileOut,
    ContentTranslationStatusOut,
    ContentVersionOut,
)
from src.modules.projects.content.history import ContentHistoryService
from src.modules.projects.content.items.domain_helpers import to_item_out
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.content.runtime import DocumentRuntimeBoundary, DocumentRuntimeItemFields


class ProjectContentCanonicalItemReadService:
    def __init__(
        self,
        repo: ProjectContentItemsRepository,
        runtime_boundary: DocumentRuntimeBoundary | None = None,
    ) -> None:
        self.repo = repo
        self.runtime_boundary = runtime_boundary or DocumentRuntimeBoundary.for_items_repo(repo)
        self.history = ContentHistoryService(repo=repo)

    async def list_items_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
        model_key: str | None,
        environment_id: UUID | None = None,
    ) -> PageData[ContentItemOut]:
        model_definition_id: UUID | None = None
        if model_key is not None:
            model = await self.repo.get_model_definition_by_key(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_key=model_key,
            )
            if model is None:
                raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
            model_definition_id = model.id

        items = await self.repo.list_items(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_definition_id=model_definition_id,
            locale=None,
        )
        active_fields = await self.runtime_boundary.resolve_active_item_fields(items)
        translation_status = await self._translation_status_by_item(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            items=items,
        )
        rows = [
            to_item_out(
                item,
                item.model_definition,
                **self._active_field_kwargs(active_fields.get(item.id)),
                translation_status=translation_status.get(item.id),
            )
            for item in items
        ]
        return paginate_items(rows, params=params)

    async def get_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        environment_id: UUID | None = None,
    ) -> ContentItemOut:
        item = await self.repo.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
        )
        if item is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        active_fields = await self.runtime_boundary.resolve_active_item_fields([item])
        translation_status = await self._translation_status_by_item(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            items=[item],
        )
        return to_item_out(
            item,
            item.model_definition,
            **self._active_field_kwargs(active_fields.get(item.id)),
            translation_status=translation_status.get(item.id),
        )

    async def _translation_status_by_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        items: list[Any],
    ) -> dict[UUID, ContentTranslationStatusOut]:
        group_ids = [
            UUID(str(group_id))
            for group_id in {getattr(item, "translation_group_id", None) for item in items}
            if group_id is not None
        ]
        if not group_ids:
            return {}

        translations = await self.repo.list_translation_items_for_groups(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            translation_group_ids=group_ids,
        )
        translations_by_group: dict[UUID, list[Any]] = {}
        for translation in translations:
            group_id = getattr(translation, "translation_group_id", None)
            if group_id is None:
                continue
            translations_by_group.setdefault(UUID(str(group_id)), []).append(translation)

        status_by_item: dict[UUID, ContentTranslationStatusOut] = {}
        for item in items:
            group_id = getattr(item, "translation_group_id", None)
            if group_id is None:
                continue
            group_uuid = UUID(str(group_id))
            group_items = translations_by_group.get(group_uuid, [item])
            locales = sorted({str(entry.locale) for entry in group_items if str(entry.locale or "").strip()})
            primary = next((entry for entry in group_items if entry.id == item.id), group_items[0])
            status = ContentTranslationStatusOut(
                group_id=group_uuid,
                primary_item_id=getattr(primary, "id", None),
                primary_locale=str(getattr(primary, "locale", None) or item.locale),
                locales=locales,
                missing_locales=[],
            )
            for entry in group_items:
                status_by_item[entry.id] = status
        return status_by_item

    @staticmethod
    def _active_field_kwargs(fields: DocumentRuntimeItemFields | None) -> dict[str, str | None]:
        if fields is None:
            return {"title": None, "slug": None, "summary": None, "visibility": None}
        return {
            "title": fields.title,
            "slug": fields.slug,
            "summary": fields.summary,
            "visibility": fields.visibility,
        }

    @staticmethod
    def _to_presentation_outs(
        presentations: list[tuple[ContentPresentationKind, dict[str, object] | None]],
    ) -> list[ContentPresentationOut]:
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
        system_object = await self.history.build_version_system_object(version=version, conn=conn)
        return system_object.to_contract()

    async def _get_item_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        version_number: int,
    ) -> ContentVersionRecord:
        system_object = await self.history.get_version_or_raise(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            version_number=version_number,
        )
        return system_object.version

    async def get_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
        environment_id: UUID | None = None,
    ) -> ContentVersionOut:
        version = await self._get_item_version(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            version_number=version_number,
        )
        return await self.build_version_out(version=version)

    async def list_versions_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        params: PageParams,
        environment_id: UUID | None = None,
    ) -> PageData[ContentVersionOut]:
        system_objects = await self.history.list_versions(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
        )
        return system_objects.to_contract_page(params=params)

    async def list_presentations(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
        environment_id: UUID | None = None,
    ) -> list[ContentPresentationOut]:
        version = await self._get_item_version(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            version_number=version_number,
        )
        presentations = await self.repo.list_presentations(version_id=version.id)
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
        return self._to_presentation_outs(normalized)

    async def get_seo_profile(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
        environment_id: UUID | None = None,
    ) -> ContentSeoProfileOut:
        version = await self._get_item_version(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
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
        environment_id: UUID | None = None,
    ) -> list[ContentComponentBindingOut]:
        version = await self._get_item_version(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            version_number=version_number,
        )
        bindings = await self.repo.list_component_bindings(version_id=version.id)
        return [self._to_binding_out(binding) for binding in bindings]
